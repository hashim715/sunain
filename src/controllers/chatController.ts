import { Application } from "express";
import http from "http";
import { Server, Socket } from "socket.io";
import Redis from "ioredis";
import { createAdapter } from "@socket.io/redis-adapter";
import { prisma } from "../config/postgres";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import Queue from "bull";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { transcriptQueue } from "./zoomSDKAuthEndpoint";

dotenv.config();

interface MeetingState {
  topicIndex: number;
  subtopicIndex: number | null;
  completedTopics: number[];
}

interface UserSession {
  meetingName: string;
  isHost: boolean;
  sessionID: string;
  jwtToken: string;
  userName: string;
  socketId: string;
  lastSeen: number;
}

interface AudioStreamInfo {
  filepath: string;
  startedAt: number;
  participantNumber: number;
  recordingNumber: number;
  serverStartTime: number;
}

interface ChunkTimestamp {
  chunkNumber: number;
  clientTimestamp: number;
  serverReceiveTime: number;
  serverRelativeTime: number;
  size: number;
  estimatedDuration?: number;
  cumulativeBytes: number; // ✅ ADD: Total bytes written so far
  cumulativeDurationMs: number; // ✅ ADD: Estimated total audio duration so far
}

interface TimingGap {
  chunkNumber: number;
  participant1Time: number | null;
  participant2Time: number | null;
  difference: number | null;
  participant1Size?: number;
  participant2Size?: number;
  participant1Latency?: number;
  participant2Latency?: number;
  participant1Duration?: number;
  participant2Duration?: number;
  missingParticipant?: 1 | 2;
}

interface RecordingMetadata {
  meetingName: string;
  recordingNumber: number;
  userName: string;
  filepath: string;
  participantNumber: number;
  startTime: Date;
  endTime: Date;
  chunkTimestamps?: ChunkTimestamp[];
  disconnectionPeriods?: DisconnectionLog[];
}

interface DisconnectionLog {
  disconnectTime: number;
  reconnectTime: number | null;
  serverElapsedMs: number; // Wall clock time since recording started
  audioPositionMs: number; // ✅ Position in the AUDIO FILE where disconnect happened
  totalBytesAtDisconnect?: number; // ✅ Bytes written at disconnect point
  lastChunkNumber: number;
  reconnectAudioPositionMs?: number;
  gapDurationMs?: number; // ✅ How much silence to insert
}

export const localRecordingQueue = new Queue("local-recordings", {
  redis: {
    host: process.env.REDIS_HOST || "localhost",
    port: parseInt(process.env.REDIS_PORT || "6379"),
  },
  defaultJobOptions: {
    attempts: 5,
    backoff: { type: "exponential", delay: 120000 },
    removeOnComplete: 100,
    removeOnFail: 500,
  },
});

const analyzeTimingGaps = (
  participant1Chunks: ChunkTimestamp[],
  participant2Chunks: ChunkTimestamp[]
): TimingGap[] => {
  const gaps: TimingGap[] = [];
  const maxChunks = Math.max(
    participant1Chunks.length,
    participant2Chunks.length
  );

  for (let i = 0; i < maxChunks; i++) {
    const p1 = participant1Chunks[i];
    const p2 = participant2Chunks[i];

    if (p1 && p2) {
      const timeDiff = p1.serverRelativeTime - p2.serverRelativeTime;

      gaps.push({
        chunkNumber: i + 1,
        participant1Time: p1.serverRelativeTime,
        participant2Time: p2.serverRelativeTime,
        difference: timeDiff,
        participant1Size: p1.size,
        participant2Size: p2.size,
        participant1Latency: p1.serverReceiveTime - (p1.clientTimestamp || 0),
        participant2Latency: p2.serverReceiveTime - (p2.clientTimestamp || 0),
        participant1Duration: p1.estimatedDuration,
        participant2Duration: p2.estimatedDuration,
      });
    } else if (p1 && !p2) {
      gaps.push({
        chunkNumber: i + 1,
        participant1Time: p1.serverRelativeTime,
        participant2Time: null,
        difference: null,
        participant1Size: p1.size,
        participant1Duration: p1.estimatedDuration,
        missingParticipant: 2 as 1 | 2,
      });
    } else if (!p1 && p2) {
      gaps.push({
        chunkNumber: i + 1,
        participant1Time: null,
        participant2Time: p2.serverRelativeTime,
        difference: null,
        participant2Size: p2.size,
        participant2Duration: p2.estimatedDuration,
        missingParticipant: 1 as 1 | 2,
      });
    }
  }

  return gaps;
};

const activeWriteStreams = new Map<string, fs.WriteStream>();
const recentlyStoppedStreams = new Map<string, number>();

const RECONNECTION_GRACE_PERIOD = 30000; // 30 seconds
const CLEANUP_CHECK_INTERVAL = 5000; // 5 seconds

export const chatController = async (
  app: Application,
  server: http.Server
): Promise<void> => {
  const io = new Server(server, {
    cors: { origin: "*", methods: ["GET", "POST"] },
  });

  const pubClient = new Redis(process.env.REDIS_URL);
  const subClient = pubClient.duplicate();

  io.adapter(createAdapter(pubClient, subClient));

  const redis = new Redis(process.env.REDIS_URL);

  const uploadsDir = path.join(__dirname, "..", "audio-recordings");
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }

  const REDIS_KEYS = {
    meetingState: (meetingName: string) => `meeting:${meetingName}:state`,

    userSession: (meetingName: string, userName: string) =>
      `session:${meetingName}:${userName}`,

    pendingDisconnect: (meetingName: string, userName: string) =>
      `disconnect:${meetingName}:${userName}`,

    audioStream: (meetingName: string, userName: string) =>
      `audio:${meetingName}:${userName}`,

    recordingMetadata: (meetingName: string, recordingNumber: number) =>
      `recording:meta:${meetingName}:${recordingNumber}`,

    sessionRecordings: (meetingName: string, recordingNumber: number) =>
      `session:recordings:${meetingName}:${recordingNumber}`,

    recordingReadiness: (meetingName: string) => `readiness:${meetingName}`,

    participantReady: (meetingName: string, userName: string) =>
      `ready:${meetingName}:${userName}`,

    chunkTimestamps: (
      meetingName: string,
      userName: string,
      recordingNumber: number
    ) => `chunk-timestamps:${meetingName}:${userName}:${recordingNumber}`,

    disconnectionLog: (
      meetingName: string,
      userName: string,
      recordingNumber: number
    ) => `disconnect-log:${meetingName}:${userName}:${recordingNumber}`,
  };

  const getMeetingState = async (
    meetingName: string
  ): Promise<MeetingState | null> => {
    const state = await redis.get(REDIS_KEYS.meetingState(meetingName));
    return state ? JSON.parse(state) : null;
  };

  const setMeetingState = async (
    meetingName: string,
    state: MeetingState
  ): Promise<void> => {
    await redis.set(
      REDIS_KEYS.meetingState(meetingName),
      JSON.stringify(state),
      "EX",
      86400
    );
  };

  const deleteMeetingData = async (meetingName: string): Promise<void> => {
    await redis.del(REDIS_KEYS.meetingState(meetingName));
  };

  const setUserSession = async (
    meetingName: string,
    userName: string,
    session: UserSession
  ): Promise<void> => {
    await redis.set(
      REDIS_KEYS.userSession(meetingName, userName),
      JSON.stringify(session),
      "EX",
      86400
    );
  };

  const getUserSession = async (
    meetingName: string,
    userName: string
  ): Promise<UserSession | null> => {
    const data = await redis.get(REDIS_KEYS.userSession(meetingName, userName));
    return data ? JSON.parse(data) : null;
  };

  const deleteUserSession = async (
    meetingName: string,
    userName: string
  ): Promise<void> => {
    await redis.del(REDIS_KEYS.userSession(meetingName, userName));
  };

  const getSessionRecordings = async (
    meetingName: string,
    recordingNumber: number
  ): Promise<RecordingMetadata[]> => {
    const key = REDIS_KEYS.sessionRecordings(meetingName, recordingNumber);

    const items = await redis.lrange(key, 0, -1);

    return items.map((item) => JSON.parse(item));
  };

  const deleteSessionRecordings = async (
    meetingName: string,
    recordingNumber: number
  ): Promise<void> => {
    await redis.del(REDIS_KEYS.sessionRecordings(meetingName, recordingNumber));
  };

  const getUserSessionBySocketId = async (socketId: string) => {
    const pattern = "session:*";
    const keys = await redis.keys(pattern);

    for (const key of keys) {
      if (key.includes("recordings")) {
        continue;
      }

      try {
        const data = await redis.get(key);
        if (data) {
          const session: UserSession = JSON.parse(data);
          if (session.socketId === socketId) {
            const parts = key.split(":");
            return {
              session,
              meetingName: parts[1],
              userName: parts[2],
            };
          }
        }
      } catch (error) {
        continue;
      }
    }
    return null;
  };

  const markPendingDisconnect = async (
    meetingName: string,
    userName: string,
    socketId: string
  ): Promise<void> => {
    const disconnectTime = Date.now();
    await redis.set(
      REDIS_KEYS.pendingDisconnect(meetingName, userName),
      JSON.stringify({ socketId, disconnectTime }),
      "PX",
      RECONNECTION_GRACE_PERIOD + 5000
    );
  };

  const getPendingDisconnect = async (
    meetingName: string,
    userName: string
  ): Promise<{ socketId: string; disconnectTime: number } | null> => {
    const data = await redis.get(
      REDIS_KEYS.pendingDisconnect(meetingName, userName)
    );
    return data ? JSON.parse(data) : null;
  };

  const clearPendingDisconnect = async (
    meetingName: string,
    userName: string
  ): Promise<void> => {
    await redis.del(REDIS_KEYS.pendingDisconnect(meetingName, userName));
  };

  const startDisconnectCleanupWorker = () => {
    setInterval(async () => {
      try {
        const pattern = "disconnect:*";
        const keys = await redis.keys(pattern);

        for (const key of keys) {
          const data = await redis.get(key);
          if (!data) continue;

          const { socketId: oldSocketId, disconnectTime } = JSON.parse(data);
          const elapsed = Date.now() - disconnectTime;

          if (elapsed >= RECONNECTION_GRACE_PERIOD) {
            const parts = key.split(":");
            const meetingName = parts[1];
            const userName = parts[2];

            const session = await getUserSession(meetingName, userName);

            console.log(
              `⏰ Grace period expired for ${userName} in ${meetingName}`
            );

            // ✅ CHECK IF RECORDING IS ACTIVE
            const activeRecording = await prisma.recordingSession.findFirst({
              where: { meetingName, isRecording: true },
            });

            if (activeRecording) {
              const streamInfo = await getAudioStreamInfo(
                meetingName,
                userName
              );

              // ✅ INSTEAD: Get the disconnect log to include in metadata
              const disconnectionLog = await getDisconnectionLog(
                meetingName,
                userName,
                activeRecording.recordingNumber
              );

              console.log(
                `📊 Disconnection log for ${userName}:`,
                disconnectionLog
              );

              if (streamInfo) {
                // SERVER AUTO-STOPS THE DISCONNECTED USER'S STREAM
                console.log(`🛑 Server auto-stopping stream for ${userName}`);

                try {
                  await closeWriteStream(oldSocketId);
                  console.log(`✅ Auto-closed stream for ${userName}`);
                } catch (error) {
                  console.log(
                    `⚠️ Stream may already be closed: ${error.message}`
                  );
                }

                // Wait for filesystem
                await new Promise((resolve) => setTimeout(resolve, 500));

                // SAVE METADATA FOR THE DISCONNECTED USER
                const recordingNumber = streamInfo.recordingNumber;

                // ✅ GET CHUNK TIMESTAMPS
                const chunkTimestamps = await getChunkTimestamps(
                  meetingName,
                  userName,
                  recordingNumber
                );

                console.log(
                  `📊 ${userName} sent ${chunkTimestamps.length} chunks`
                );

                // Verify file exists
                if (fs.existsSync(streamInfo.filepath)) {
                  const stats = fs.statSync(streamInfo.filepath);
                  const duration = Date.now() - streamInfo.startedAt;

                  const recordingMetadata: RecordingMetadata = {
                    meetingName,
                    recordingNumber,
                    userName,
                    filepath: streamInfo.filepath,
                    participantNumber: streamInfo.participantNumber,
                    startTime: new Date(streamInfo.startedAt),
                    endTime: new Date(),
                    disconnectionPeriods: disconnectionLog, // ✅ Add disconnect log
                    chunkTimestamps, // ✅ ADD CHUNK TIMING DATA
                  };

                  console.log(`📝 Auto-saving metadata for ${userName}:`, {
                    filepath: streamInfo.filepath,
                    fileSize: stats.size,
                    disconnections: disconnectionLog.length,
                  });

                  // Save metadata atomically
                  const metadataKey = REDIS_KEYS.sessionRecordings(
                    meetingName,
                    recordingNumber
                  );

                  const count = await redis.rpush(
                    metadataKey,
                    JSON.stringify(recordingMetadata)
                  );

                  await redis.expire(metadataKey, 172800);

                  console.log(
                    `✅ Auto-saved metadata for ${userName} (${count} participants)`
                  );

                  // Check if all participants done
                  const recordingSession =
                    await prisma.recordingSession.findFirst({
                      where: { meetingName, recordingNumber },
                    });

                  if (
                    recordingSession &&
                    count === recordingSession.participantCount
                  ) {
                    console.log(
                      `✅ All recordings complete, queueing processing...`
                    );

                    const lockKey = `lock:processing:${meetingName}:${recordingNumber}`;
                    const lockSet = await redis.set(
                      lockKey,
                      "locked",
                      "EX",
                      30,
                      "NX"
                    );

                    if (lockSet) {
                      try {
                        const sessionRecordings = await getSessionRecordings(
                          meetingName,
                          recordingNumber
                        );

                        const jobId = `local-${meetingName}-${recordingNumber}`;
                        await localRecordingQueue.add(
                          "process-local-recording",
                          {
                            meetingName,
                            recordingNumber,
                            recordings: sessionRecordings,
                          },
                          {
                            jobId,
                            priority: 1,
                          }
                        );

                        await prisma.recordingSession.update({
                          where: { id: recordingSession.id },
                          data: {
                            status: "completed",
                            isRecording: false,
                            recordingEndTime: new Date(),
                          },
                        });

                        // ✅ CLEAR WAITING TIMEOUT
                        await redis.del(
                          `wait-timeout:${meetingName}:${recordingNumber}`
                        );

                        console.log(
                          `🎯 Queued processing for recording ${recordingNumber}`
                        );
                      } catch (error) {
                        // ✅ ERROR HANDLING
                        console.error(
                          `❌ Failed in disconnect cleanup:`,
                          error
                        );

                        await prisma.recordingSession.update({
                          where: { id: recordingSession.id },
                          data: {
                            status: "incomplete",
                            isRecording: false,
                            recordingEndTime: new Date(),
                          },
                        });

                        await redis.del(lockKey);
                      }
                    }
                  }
                } else {
                  console.error(
                    `❌ File not found for ${userName}: ${streamInfo.filepath}`
                  );
                }

                // Cleanup stream info
                await deleteAudioStream(meetingName, userName);

                // ✅ CLEANUP DISCONNECT LOG
                await redis.del(
                  REDIS_KEYS.disconnectionLog(
                    meetingName,
                    userName,
                    activeRecording.recordingNumber
                  )
                );
              }
            }

            // NOTIFY OTHER PARTICIPANTS TO STOP THEIR RECORDINGS
            io.to(meetingName).emit("participant-disconnected-timeout", {
              meetingName,
              userName,
              message: "Participant was disconnected too long",
            });

            // Cleanup
            if (session && session.socketId === oldSocketId) {
              await deleteUserSession(meetingName, userName);
            }

            await clearPendingDisconnect(meetingName, userName);
          }
        }
      } catch (error) {
        console.error("❌ Error in disconnect cleanup worker:", error);
      }
    }, CLEANUP_CHECK_INTERVAL);
  };

  startDisconnectCleanupWorker();

  const setAudioStreamInfo = async (
    meetingName: string,
    userName: string,
    info: AudioStreamInfo
  ): Promise<void> => {
    await redis.set(
      REDIS_KEYS.audioStream(meetingName, userName),
      JSON.stringify(info),
      "EX",
      7200
    );
  };

  const getAudioStreamInfo = async (
    meetingName: string,
    userName: string
  ): Promise<AudioStreamInfo | null> => {
    const data = await redis.get(REDIS_KEYS.audioStream(meetingName, userName));
    return data ? JSON.parse(data) : null;
  };

  const deleteAudioStream = async (
    meetingName: string,
    userName: string
  ): Promise<void> => {
    await redis.del(REDIS_KEYS.audioStream(meetingName, userName));
  };

  const getOrCreateWriteStream = (
    socketId: string,
    filepath: string
  ): fs.WriteStream => {
    let stream = activeWriteStreams.get(socketId);

    if (!stream || !stream.writable) {
      stream = fs.createWriteStream(filepath, { flags: "a" });
      activeWriteStreams.set(socketId, stream);
    }

    return stream;
  };

  const closeWriteStream = (socketId: string): Promise<void> => {
    return new Promise((resolve, reject) => {
      const stream = activeWriteStreams.get(socketId);

      if (!stream) {
        resolve(); // No stream to close
        return;
      }

      // Wait for stream to finish writing
      stream.end((err: any) => {
        if (err) {
          console.error(`❌ Error closing stream for ${socketId}:`, err);
          reject(err);
        } else {
          activeWriteStreams.delete(socketId);
          console.log(`✅ Stream closed and flushed for ${socketId}`);
          resolve();
        }
      });
    });
  };

  const updateMeeting = async (meetingName: string) => {
    try {
      await prisma.meeting.update({
        where: { sessionName: meetingName },
        data: { isActive: false, endedAt: new Date() },
      });
      console.log(`✅ Meeting ${meetingName} marked as inactive`);
    } catch (err) {
      console.error("Error updating meeting:", err);
    }
  };

  const handleMeetingLeave = async (meetingName: string, userName: string) => {
    try {
      const now = new Date();

      const meeting = await prisma.meeting.findUnique({
        where: { sessionName: meetingName },
      });

      if (!meeting) {
        throw new Error("Meeting not found");
      }

      const user = await prisma.user.findUnique({
        where: { username: userName },
      });

      if (!user) {
        throw new Error("User not found");
      }

      const durationMs = now.getTime() - meeting.createdAt.getTime();
      const durationMinutes = Math.floor(durationMs / (1000 * 60));

      await prisma.meetingParticipant.update({
        where: {
          meetingId_userId: {
            meetingId: meeting.id,
            userId: user.id,
          },
        },
        data: { duration: durationMinutes, leftAt: now },
      });

      await prisma.meeting.update({
        where: { sessionName: meetingName },
        data: {
          participantCount:
            meeting.participantCount >= 1 ? meeting.participantCount - 1 : 0,
        },
      });

      console.log(
        `Meeting ${meetingName} ended for ${userName}. Duration: ${durationMinutes} minutes.`
      );
    } catch (err) {
      console.error("Error leaving meeting:", err);
    }
  };

  const checkReadinessTimeout = async (
    meetingName: string,
    allParticipants: string[]
  ) => {
    try {
      const stateData = await redis.get(
        REDIS_KEYS.recordingReadiness(meetingName)
      );

      if (!stateData) {
        return;
      }

      const state = JSON.parse(stateData);

      if (state.readyParticipants.length === state.totalParticipants) {
        return;
      }

      const notReady = allParticipants.filter(
        (u) => !state.readyParticipants.includes(u)
      );

      console.error(`❌ Readiness timeout. Not ready: ${notReady.join(", ")}`);

      io.to(meetingName).emit("recording-readiness-timeout", {
        ready: state.readyParticipants,
        notReady,
        message: `Cannot start: ${notReady.join(", ")} not responding`,
      });

      await redis.del(REDIS_KEYS.recordingReadiness(meetingName));
      for (const user of allParticipants) {
        await redis.del(REDIS_KEYS.participantReady(meetingName, user));
      }
    } catch (error) {
      console.error("❌ Error checking readiness timeout:", error);
    }
  };

  const startRecordingForMeeting = async (meetingName: string) => {
    try {
      // ✅ PREVENT RACE CONDITION - Use Redis lock
      const lockKey = `lock:recording:${meetingName}`;
      const lockSet = await redis.set(lockKey, "locked", "EX", 5, "NX");

      if (!lockSet) {
        console.log(`⏭️ Recording already started for ${meetingName}`);
        return;
      }

      console.log(`🎬 Starting recording for ${meetingName}`);

      const meeting = await prisma.meeting.findUnique({
        where: { sessionName: meetingName },
        include: { participants: true },
      });

      if (!meeting) {
        throw new Error("Meeting not found");
      }

      io.to(meetingName).emit("start-recording-now", {
        timestamp: Date.now(),
      });

      await redis.del(REDIS_KEYS.recordingReadiness(meetingName));

      const meeting2 = await prisma.meeting.findUnique({
        where: { sessionName: meetingName },
        include: { participants: { include: { user: true } } },
      });

      for (const p of meeting2.participants) {
        await redis.del(
          REDIS_KEYS.participantReady(meetingName, p.user.username)
        );
      }

      await redis.del(lockKey);

      console.log(`✅ Recording  started for all participants`);
    } catch (error) {
      io.to(meetingName).emit("recording-start-failed", {
        message: error.message,
      });
      await redis.del(`lock:recording:${meetingName}`);
    }
  };

  const logDisconnection = async (
    meetingName: string,
    userName: string,
    recordingNumber: number,
    disconnectTime: number
  ): Promise<void> => {
    const streamInfo = await getAudioStreamInfo(meetingName, userName);
    const chunks = await getChunkTimestamps(
      meetingName,
      userName,
      recordingNumber
    );

    // Server elapsed time when disconnect happened
    const serverElapsedMs = streamInfo
      ? disconnectTime - streamInfo.serverStartTime
      : 0;

    // ✅ ACTUAL AUDIO POSITION = cumulative duration of all chunks received
    let audioPositionInFileMs = 0;
    let totalBytesReceived = 0;

    if (chunks.length > 0) {
      const lastChunk = chunks[chunks.length - 1];
      audioPositionInFileMs =
        lastChunk.cumulativeDurationMs ||
        chunks.length * (lastChunk.estimatedDuration || 40000);
      totalBytesReceived = lastChunk.cumulativeBytes || 0;
    }

    const log: DisconnectionLog = {
      disconnectTime,
      reconnectTime: null,
      serverElapsedMs: Math.max(0, serverElapsedMs), // When disconnect happened (wall clock)
      audioPositionMs: audioPositionInFileMs, // ✅ WHERE IN THE FILE the disconnect happened
      totalBytesAtDisconnect: totalBytesReceived, // ✅ Bytes written at disconnect
      lastChunkNumber: chunks.length,
      gapDurationMs: undefined,
    };

    console.log(`📝 Saving disconnection log:`, {
      serverElapsedMs,
      audioPositionInFileMs,
      totalBytesReceived,
      lastChunkNumber: chunks.length,
    });

    const key = REDIS_KEYS.disconnectionLog(
      meetingName,
      userName,
      recordingNumber
    );
    await redis.rpush(key, JSON.stringify(log));
    await redis.expire(key, 172800);

    console.log(
      `📝 Logged disconnection for ${userName} at audio position ${audioPositionInFileMs}ms (${totalBytesReceived} bytes, chunk ${chunks.length})`
    );
  };

  const logReconnection = async (
    meetingName: string,
    userName: string,
    recordingNumber: number,
    reconnectTime: number
  ): Promise<void> => {
    const key = REDIS_KEYS.disconnectionLog(
      meetingName,
      userName,
      recordingNumber
    );
    const logs = await redis.lrange(key, 0, -1);

    if (logs.length === 0) return;

    for (let i = logs.length - 1; i >= 0; i--) {
      const log: DisconnectionLog = JSON.parse(logs[i]);

      if (log.reconnectTime === null) {
        log.reconnectTime = reconnectTime;

        // ✅ GAP DURATION = time between disconnect and reconnect
        log.gapDurationMs = reconnectTime - log.disconnectTime;

        // ✅ The audio position where new audio will start appending
        // (This is the same as audioPositionMs since file is continuous)
        log.reconnectAudioPositionMs = log.audioPositionMs;

        await redis.del(key);
        const updatedLogs = logs.map((item, idx) =>
          idx === i ? JSON.stringify(log) : item
        );
        for (const item of updatedLogs) {
          await redis.rpush(key, item);
        }
        await redis.expire(key, 172800);

        console.log(`📝 Reconnection logged:`, {
          gapDurationMs: log.gapDurationMs,
          audioPositionMs: log.audioPositionMs,
          message: `Insert ${log.gapDurationMs}ms silence at ${log.audioPositionMs}ms in the file`,
        });
        break;
      }
    }
  };

  const getDisconnectionLog = async (
    meetingName: string,
    userName: string,
    recordingNumber: number
  ): Promise<DisconnectionLog[]> => {
    const key = REDIS_KEYS.disconnectionLog(
      meetingName,
      userName,
      recordingNumber
    );
    const logs = await redis.lrange(key, 0, -1);

    return logs.map((item) => {
      const log: DisconnectionLog = JSON.parse(item);
      return log;
    });
  };

  const startWaitingTimeoutWorker = () => {
    setInterval(async () => {
      try {
        const pattern = "wait-timeout:*";
        const keys = await redis.keys(pattern);

        for (const key of keys) {
          const startTimeStr = await redis.get(key);
          if (!startTimeStr) continue;

          const startTime = parseInt(startTimeStr);
          const elapsed = Date.now() - startTime;

          // ✅ 2 MINUTE TIMEOUT
          if (elapsed >= 120000) {
            const parts = key.split(":");
            const meetingName = parts[1];
            const recordingNumber = parseInt(parts[2]);

            console.log(
              `⏰ Waiting timeout expired for ${meetingName} recording ${recordingNumber}`
            );

            // ✅ MARK SESSION AS FAILED
            const session = await prisma.recordingSession.findFirst({
              where: { meetingName, recordingNumber },
            });

            if (session && session.isRecording) {
              console.log(
                `❌ Not all participants finished within 1 minute - marking as failed`
              );

              await prisma.recordingSession.update({
                where: { id: session.id },
                data: {
                  status: "incomplete",
                  isRecording: false,
                  recordingEndTime: new Date(),
                },
              });

              // Clean up Redis
              await deleteSessionRecordings(meetingName, recordingNumber);
              await redis.del(key);

              console.log(
                `✅ Marked session ${recordingNumber} as failed due to timeout`
              );
            }
          }
        }
      } catch (error) {
        console.error("❌ Error in waiting timeout worker:", error);
      }
    }, 10000);
  };

  startWaitingTimeoutWorker();

  const getChunkTimestamps = async (
    meetingName: string,
    userName: string,
    recordingNumber: number
  ): Promise<ChunkTimestamp[]> => {
    const key = REDIS_KEYS.chunkTimestamps(
      meetingName,
      userName,
      recordingNumber
    );
    const items = await redis.lrange(key, 0, -1);
    return items.map((item) => JSON.parse(item));
  };

  const firstChunkHeaders = new Map<string, Buffer>();

  io.on("connection", (socket: Socket): void => {
    socket.on(
      "join-meeting",
      async ({
        meetingName,

        isHost,
        sessionID,
        jwtToken,
        userName,
        isReconnect,
      }) => {
        console.log(
          `👤 ${userName} joining ${meetingName} (reconnect: ${isReconnect})`
        );

        socket.join(meetingName);

        if (isReconnect) {
          const pendingDisconnect = await getPendingDisconnect(
            meetingName,
            userName
          );
          if (pendingDisconnect) {
            await clearPendingDisconnect(meetingName, userName);
            console.log(`✅ Cleared pending disconnect for ${userName}`);

            const activeRecording = await prisma.recordingSession.findFirst({
              where: { meetingName, isRecording: true },
            });

            if (activeRecording) {
              const reconnectTime = Date.now();
              await logReconnection(
                meetingName,
                userName,
                activeRecording.recordingNumber,
                reconnectTime
              );
            }
          }
        }

        const session: UserSession = {
          meetingName,
          userName,
          isHost,
          sessionID,
          jwtToken,
          socketId: socket.id,
          lastSeen: Date.now(),
        };

        await setUserSession(meetingName, userName, session);

        if (isReconnect) {
          io.to(meetingName).emit("refresh-participants", {
            userName,
            isHost,
          });
        }

        try {
          const existingMeetingState = await getMeetingState(meetingName);

          if (isHost && !existingMeetingState) {
            const initialState: MeetingState = {
              topicIndex: 0,
              subtopicIndex: null,
              completedTopics: [],
            };
            await setMeetingState(meetingName, initialState);
          }
        } catch (error) {
          console.error("❌ Error in join-meeting:", error);
        }
      }
    );

    socket.on(
      "start-audio-stream",
      async (data: {
        meetingName: string;
        userName: string;
        recordingStartTime: number;
      }) => {
        try {
          const { meetingName, userName } = data;

          const session = await prisma.recordingSession.findFirst({
            where: { meetingName, isRecording: true },
          });

          if (!session) {
            throw new Error("No active recording session found");
          }

          const recordingNumber = session.recordingNumber;
          const meetingDir = path.join(uploadsDir, meetingName);

          if (!fs.existsSync(meetingDir)) {
            fs.mkdirSync(meetingDir, { recursive: true });
          }

          const meeting = await prisma.meeting.findUnique({
            where: { sessionName: meetingName },
            include: {
              participants: {
                include: { user: true },
                orderBy: { userId: "asc" },
              },
            },
          });

          const participant = meeting?.participants.find(
            (p: { user: { username: string } }) => p.user.username === userName
          );

          if (!participant) {
            throw new Error("Participant not found");
          }

          const participantNumber =
            meeting.participants.indexOf(participant) + 1;

          const recordingStartKey = `recording-start:${meetingName}:${recordingNumber}`;
          let serverStartTime: number;

          const existingStartTime = await redis.get(recordingStartKey);

          if (existingStartTime) {
            serverStartTime = parseInt(existingStartTime, 10);
            console.log(
              `📍 Using shared start time for ${userName}: ${serverStartTime}`
            );
          } else {
            serverStartTime = Date.now();
            await redis.set(
              recordingStartKey,
              serverStartTime.toString(),
              "EX",
              7200
            );
            console.log(
              `📍 Set shared start time by ${userName}: ${serverStartTime}`
            );
          }

          const filepath = path.join(
            meetingDir,
            `recording-${recordingNumber}-participant-${participantNumber}.webm`
          );

          const streamInfo: AudioStreamInfo = {
            filepath,
            startedAt: serverStartTime,
            serverStartTime,
            participantNumber,
            recordingNumber,
          };

          await setAudioStreamInfo(meetingName, userName, streamInfo);

          console.log(
            `✅ Audio stream started: ${userName} (P${participantNumber}) at ${serverStartTime}`
          );

          socket.emit("audio-stream-ready", {
            filepath,
            recordingNumber,
            serverStartTime,
          });
        } catch (error) {
          console.error("❌ Error starting audio stream:", error);
          socket.emit("audio-stream-error", {
            message: error.message || "Failed to start audio stream",
          });
        }
      }
    );

    socket.on(
      "audio-chunk",
      async (data: {
        meetingName: string;
        userName: string;
        chunk: any;
        timestamp: number;
        chunkNumber: number;
      }) => {
        try {
          const { meetingName, userName, chunk, timestamp, chunkNumber } = data;

          const streamInfo = await getAudioStreamInfo(meetingName, userName);

          if (!streamInfo) {
            const key = `${meetingName}:${userName}`;
            const stoppedAt = recentlyStoppedStreams.get(key);

            if (stoppedAt && Date.now() - stoppedAt < 2000) {
              return;
            }

            console.warn(
              `⚠️ No active stream for ${userName} in ${meetingName}`
            );
            return;
          }

          let audioBuffer: Buffer;

          if (Buffer.isBuffer(chunk)) {
            audioBuffer = chunk;
          } else if (ArrayBuffer.isView(chunk)) {
            audioBuffer = Buffer.from(chunk.buffer);
          } else if (chunk?.constructor?.name === "ArrayBuffer") {
            audioBuffer = Buffer.from(chunk);
          } else if (Array.isArray(chunk)) {
            audioBuffer = Buffer.from(chunk);
          } else if (chunk?.type === "Buffer" && Array.isArray(chunk?.data)) {
            audioBuffer = Buffer.from(chunk.data);
          } else {
            console.error(
              `❌ Unknown chunk type for ${userName}:`,
              typeof chunk
            );
            return;
          }

          // Write raw chunk directly to stream file (no reconstruction)
          const stream = getOrCreateWriteStream(socket.id, streamInfo.filepath);

          if (stream.writable) {
            stream.write(audioBuffer);
          }

          const serverReceiveTime = Date.now();
          const serverRelativeTime =
            serverReceiveTime - streamInfo.serverStartTime;

          // ✅ GET PREVIOUS CHUNKS TO CALCULATE CUMULATIVE VALUES
          const previousChunks = await getChunkTimestamps(
            meetingName,
            userName,
            streamInfo.recordingNumber
          );

          const previousCumulativeBytes =
            previousChunks.length > 0
              ? previousChunks[previousChunks.length - 1].cumulativeBytes || 0
              : 0;

          const previousCumulativeDuration =
            previousChunks.length > 0
              ? previousChunks[previousChunks.length - 1]
                  .cumulativeDurationMs || 0
              : 0;

          const chunkDuration = 40000; // 40 seconds per chunk (from MediaRecorder.start(40000))

          const chunkInfo: ChunkTimestamp = {
            chunkNumber,
            clientTimestamp: timestamp,
            serverReceiveTime,
            serverRelativeTime,
            size: audioBuffer.byteLength,
            estimatedDuration: chunkDuration,
            cumulativeBytes: previousCumulativeBytes + audioBuffer.byteLength,
            cumulativeDurationMs: previousCumulativeDuration + chunkDuration,
          };

          const timestampKey = REDIS_KEYS.chunkTimestamps(
            meetingName,
            userName,
            streamInfo.recordingNumber
          );

          await redis.rpush(timestampKey, JSON.stringify(chunkInfo));
          await redis.expire(timestampKey, 172800);

          if (chunkNumber % 10 === 0) {
            console.log(
              `📊 ${userName} chunk ${chunkNumber} @ ${serverRelativeTime}ms (${audioBuffer.byteLength} bytes, cumulative: ${chunkInfo.cumulativeDurationMs}ms)`
            );
          }
        } catch (error: any) {
          console.error("❌ Error writing audio chunk:", error);
        }
      }
    );

    socket.on(
      "stop-audio-stream",
      async (data: { meetingName: string; userName: string }) => {
        try {
          const { meetingName, userName } = data;

          console.log(`🛑 Stop request from ${userName}`);

          const streamInfo = await getAudioStreamInfo(meetingName, userName);

          if (!streamInfo) {
            const key = `${meetingName}:${userName}`;
            const stoppedAt = recentlyStoppedStreams.get(key);

            if (stoppedAt && Date.now() - stoppedAt < 5000) {
              console.log(`⏭️ Stream already stopped recently for ${userName}`);
              return;
            }

            console.warn(`⚠️ No stream info for ${userName}`);
            socket.emit("audio-stream-error", {
              message: "No active stream found",
            });
            return;
          }

          if (streamInfo) {
            const participantKey = `${meetingName}:${userName}:${streamInfo.recordingNumber}`;
            firstChunkHeaders.delete(participantKey);
            console.log(`🗑️ Cleaned up headers for ${userName}`);
          }

          const closeSocketId = socket.id;
          console.log(`🔄 Closing stream for socket ${closeSocketId}...`);

          try {
            await closeWriteStream(closeSocketId);
            console.log(`✅ Stream closed for ${userName}`);
          } catch (error) {
            console.log(`⚠️ Stream may already be closed for ${closeSocketId}`);
          }

          await new Promise((resolve) => setTimeout(resolve, 500));

          const recordingNumber = streamInfo.recordingNumber;

          const chunkTimestamps = await getChunkTimestamps(
            meetingName,
            userName,
            recordingNumber
          );

          console.log(`📊 ${userName} sent ${chunkTimestamps.length} chunks`);

          console.log(`🔍 Stream info:`, {
            recordingNumber,
            participantNumber: streamInfo.participantNumber,
            filepath: streamInfo.filepath,
          });

          const disconnectionLog = await getDisconnectionLog(
            meetingName,
            userName,
            recordingNumber
          );

          let fileExists = false;
          let attempts = 0;
          const maxAttempts = 5;

          while (!fileExists && attempts < maxAttempts) {
            fileExists = fs.existsSync(streamInfo.filepath);

            if (!fileExists) {
              attempts++;
              const waitTime = 100 * Math.pow(2, attempts);
              console.log(
                `⏳ File not found yet, waiting ${waitTime}ms (attempt ${attempts}/${maxAttempts})...`
              );
              await new Promise((resolve) => setTimeout(resolve, waitTime));
            }
          }

          if (!fs.existsSync(streamInfo.filepath)) {
            console.error(
              `❌ File not found after ${maxAttempts} attempts: ${streamInfo.filepath}`
            );

            const dir = path.dirname(streamInfo.filepath);
            if (fs.existsSync(dir)) {
              const files = fs.readdirSync(dir);
              console.log(`📁 Directory contents:`, files);
            }

            throw new Error(`Recording file not found: ${streamInfo.filepath}`);
          }

          const stats = fs.statSync(streamInfo.filepath);
          console.log(
            `✅ File verified: ${streamInfo.filepath} (${stats.size} bytes)`
          );

          if (stats.size === 0) {
            console.warn(`⚠️ File is empty: ${streamInfo.filepath}`);
          }

          const duration = Date.now() - streamInfo.startedAt;

          const recordingMetadata: RecordingMetadata = {
            meetingName,
            recordingNumber,
            userName,
            filepath: streamInfo.filepath,
            participantNumber: streamInfo.participantNumber,
            startTime: new Date(streamInfo.startedAt),
            endTime: new Date(),
            disconnectionPeriods: disconnectionLog,
            chunkTimestamps,
          };

          console.log(
            `📝 Saving metadata with ${disconnectionLog.length} disconnection(s):`,
            {
              recordingNumber,
              participantNumber: streamInfo.participantNumber,
              filepath: streamInfo.filepath,
              fileSize: stats.size,
              disconnections: disconnectionLog,
            }
          );

          const session = await prisma.recordingSession.findFirst({
            where: { meetingName, recordingNumber },
          });

          if (!session) {
            console.warn(
              `⚠️ Session not found: ${meetingName} #${recordingNumber}`
            );
            socket.emit("audio-stream-stopped", {
              filepath: streamInfo.filepath,
              duration,
              recordingNumber,
            });
            return;
          }

          const metadataKey = REDIS_KEYS.sessionRecordings(
            meetingName,
            recordingNumber
          );

          const count = await redis.rpush(
            metadataKey,
            JSON.stringify(recordingMetadata)
          );

          await redis.expire(metadataKey, 172800);

          await deleteAudioStream(meetingName, userName);

          await redis.del(
            REDIS_KEYS.disconnectionLog(meetingName, userName, recordingNumber)
          );

          const key = `${meetingName}:${userName}`;
          recentlyStoppedStreams.set(key, Date.now());

          setTimeout(() => {
            recentlyStoppedStreams.delete(key);
          }, 5000);

          console.log(
            `🛑 Recording #${recordingNumber} stopped for ${userName} (${duration}ms, ${stats.size} bytes)`
          );

          console.log(
            `📊 Session progress: ${count}/${session.participantCount}`
          );

          if (count === session.participantCount) {
            // ✅ ALL FILES READY - PROCESS IMMEDIATELY
            const lockKey = `lock:processing:${meetingName}:${recordingNumber}`;
            const lockSet = await redis.set(lockKey, "locked", "EX", 30, "NX");

            if (!lockSet) {
              console.log(`⏭️ Processing already started`);
              socket.emit("audio-stream-stopped", {
                filepath: streamInfo.filepath,
                duration,
                recordingNumber,
              });
              return;
            }

            try {
              console.log(
                `✅ All ${count} recordings complete for session ${recordingNumber}`
              );

              const sessionRecordings = await getSessionRecordings(
                meetingName,
                recordingNumber
              );

              console.log("🔍 Verifying all files...");
              for (const rec of sessionRecordings) {
                if (!fs.existsSync(rec.filepath)) {
                  console.error(`❌ Missing file: ${rec.filepath}`);
                  throw new Error(`Recording file missing: ${rec.filepath}`);
                }
                const fileStats = fs.statSync(rec.filepath);
                console.log(
                  `   ✅ ${rec.userName}: ${rec.filepath} (${fileStats.size} bytes)`
                );
              }

              const jobId = `local-${meetingName}-${recordingNumber}`;

              await localRecordingQueue.add(
                "process-local-recording",
                {
                  meetingName,
                  recordingNumber,
                  recordings: sessionRecordings,
                },
                {
                  jobId,
                  priority: 1,
                }
              );

              await prisma.recordingSession.update({
                where: { id: session.id },
                data: {
                  status: "completed",
                  isRecording: false,
                  recordingEndTime: new Date(),
                },
              });

              console.log(
                `🎯 Queued processing for recording ${recordingNumber}`
              );
            } catch (error: any) {
              // ✅ ERROR HANDLING - MARK AS FAILED
              console.error(`❌ Failed to queue processing:`, error);

              await prisma.recordingSession.update({
                where: { id: session.id },
                data: {
                  status: "incomplete",
                  isRecording: false,
                  recordingEndTime: new Date(),
                },
              });

              await redis.del(lockKey);

              throw error;
            }
          } else {
            // ✅ WAITING FOR OTHER PARTICIPANTS - SET 2 MINUTE TIMEOUT
            console.log(`⏳ Waiting: ${count}/${session.participantCount}`);

            // ✅ SET TIMEOUT KEY IN REDIS
            const waitTimeoutKey = `wait-timeout:${meetingName}:${recordingNumber}`;

            // Only set timeout if not already set by another participant
            const alreadySet = await redis.get(waitTimeoutKey);

            if (!alreadySet) {
              await redis.set(waitTimeoutKey, Date.now().toString(), "EX", 120);
              console.log(
                `⏰ Started 2-minute timeout for session ${recordingNumber}`
              );
            }
          }

          socket.emit("audio-stream-stopped", {
            filepath: streamInfo.filepath,
            duration,
            recordingNumber,
          });
        } catch (error) {
          console.error("❌ Error stopping audio stream:", error);

          try {
            const { meetingName } = data;
            const failedSession = await prisma.recordingSession.findFirst({
              where: { meetingName, isRecording: true },
            });

            if (failedSession) {
              await prisma.recordingSession.update({
                where: { id: failedSession.id },
                data: {
                  status: "incomplete",
                  isRecording: false,
                  recordingEndTime: new Date(),
                },
              });
              console.log(`📝 Marked session as failed due to error`);
            }
          } catch (updateError) {
            console.error("❌ Could not mark session as failed:", updateError);
          }

          socket.emit("audio-stream-error", {
            message: error.message || "Failed to stop stream",
          });
        }
      }
    );

    socket.on("request-topic-state", async ({ meetingName }) => {
      try {
        const state = await getMeetingState(meetingName);
        if (state) {
          socket.emit("current-topic-state", state);
        } else {
          const defaultState: MeetingState = {
            topicIndex: 0,
            subtopicIndex: null,
            completedTopics: [],
          };
          socket.emit("current-topic-state", defaultState);
        }
      } catch (error) {
        console.error("❌ Error in request-topic-state:", error);
      }
    });

    socket.on(
      "select-subtopic",
      async ({ meetingName, topicIndex, subtopicIndex, selectedBy }) => {
        try {
          let state = await getMeetingState(meetingName);
          if (!state) {
            state = {
              topicIndex: 0,
              subtopicIndex: null,
              completedTopics: [],
            };
          }

          state.topicIndex = topicIndex;
          state.subtopicIndex = subtopicIndex;

          await setMeetingState(meetingName, state);

          io.to(meetingName).emit("subtopic-selected", {
            topicIndex,
            subtopicIndex,
            selectedBy,
          });
        } catch (error) {
          console.error("❌ Error in select-subtopic:", error);
        }
      }
    );

    socket.on(
      "change-topic",
      async ({
        meetingName,
        topicIndex,
        subtopicIndex,
        completedTopics,
        changedBy,
      }) => {
        try {
          let state = await getMeetingState(meetingName);
          if (!state) {
            state = {
              topicIndex: 0,
              subtopicIndex: null,
              completedTopics: [],
            };
          }

          state.topicIndex = topicIndex;
          state.subtopicIndex = subtopicIndex;
          state.completedTopics = completedTopics;

          await setMeetingState(meetingName, state);

          io.to(meetingName).emit("topic-changed", {
            topicIndex,
            subtopicIndex,
            completedTopics,
            changedBy,
          });
        } catch (error) {
          console.error("❌ Error in change-topic:", error);
        }
      }
    );

    socket.on("host-start-recording", async ({ meetingName, userName }) => {
      try {
        console.log(
          `🎬 ${userName} (host) initiating recording in ${meetingName}`
        );

        // ✅ CHECK FOR ACTIVE RECORDING SESSION
        const activeSession = await prisma.recordingSession.findFirst({
          where: {
            meetingName,
            isRecording: true,
          },
        });

        if (activeSession) {
          socket.emit("recording-start-failed", {
            message:
              "Recording is already in progress for this meeting wait 2 minutes before starting a new one.",
          });
          return;
        }

        // ✅ GET ALL PARTICIPANTS
        const meeting = await prisma.meeting.findUnique({
          where: { sessionName: meetingName },
          include: {
            participants: {
              include: { user: true },
            },
          },
        });

        if (!meeting) {
          socket.emit("recording-start-failed", {
            message: "Meeting not found.",
          });
          return;
        }

        const allParticipants = meeting.participants.map(
          (p: { user: { username: string } }) => p.user.username
        );

        // ✅ CHECK FOR ACTIVE DISCONNECT TIMEOUTS
        const activeDisconnects: string[] = [];

        for (const participant of allParticipants) {
          const pendingDisconnect = await getPendingDisconnect(
            meetingName,
            participant
          );

          if (pendingDisconnect) {
            const elapsed = Date.now() - pendingDisconnect.disconnectTime;
            const remaining = RECONNECTION_GRACE_PERIOD - elapsed;

            if (remaining > 0) {
              activeDisconnects.push(participant);
            }
          }
        }

        // ✅ BLOCK IF ANY DISCONNECT TIMEOUTS ACTIVE
        if (activeDisconnects.length > 0) {
          const remainingTime = Math.max(
            ...(await Promise.all(
              activeDisconnects.map(async (participant) => {
                const pending = await getPendingDisconnect(
                  meetingName,
                  participant
                );
                return pending
                  ? RECONNECTION_GRACE_PERIOD -
                      (Date.now() - pending.disconnectTime)
                  : 0;
              })
            ))
          );

          socket.emit("recording-start-failed", {
            message: `Cannot start recording: ${activeDisconnects.join(", ")} ${
              activeDisconnects.length === 1 ? "is" : "are"
            } reconnecting. Please wait ${Math.ceil(
              remainingTime / 1000
            )} seconds.`,
            details: {
              activeDisconnects,
              remainingTime: Math.ceil(remainingTime / 1000),
            },
          });
          return;
        }

        // ✅ PROCEED WITH HEALTH CHECK
        socket.emit("host-health-check-required", {
          message: "Testing your connection...",
        });
      } catch (error) {
        console.error("❌ Error in host-start-recording:", error);
        socket.emit("recording-start-failed", {
          message: "Some issue with your network connection..",
        });
      }
    });

    socket.on("host-test-chunk", async ({ meetingName, userName, chunk }) => {
      try {
        if (!chunk || chunk.byteLength === 0) {
          socket.emit("host-health-check-failed", {
            reason: "Empty test chunk",
          });
          return;
        }

        // ✅ CHECK IF AUDIO HAS ACTUAL VOLUME (not silent/muted)
        const pcmData = new Int16Array(chunk);
        const maxVolume = Math.max(...pcmData.map(Math.abs));
        const avgVolume =
          pcmData.reduce((sum, val) => sum + Math.abs(val), 0) / pcmData.length;

        console.log(`🔊 Host ${userName} volume check:`, {
          maxVolume,
          avgVolume,
          samples: pcmData.length,
        });

        // ✅ THRESHOLD: Max volume should be > 500 (out of 32767)
        // This ensures mic is not muted and picking up sound
        const MIN_VOLUME_THRESHOLD = 200;

        if (maxVolume < MIN_VOLUME_THRESHOLD) {
          socket.emit("host-health-check-failed", {
            reason: "Microphone appears to be muted or not picking up sound",
            details: {
              maxVolume,
              required: MIN_VOLUME_THRESHOLD,
            },
          });
          return;
        }

        console.log(
          `✅ Host ${userName} health check passed (${chunk.byteLength} bytes)`
        );

        const meeting = await prisma.meeting.findUnique({
          where: { sessionName: meetingName },
          include: {
            participants: {
              include: { user: true },
              orderBy: { userId: "asc" },
            },
          },
        });

        if (!meeting) {
          throw new Error("Meeting not found");
        }

        const allParticipants = meeting.participants.map(
          (p: { user: { username: string } }) => p.user.username
        );
        const otherParticipants = allParticipants.filter(
          (p: string) => p !== userName
        );

        const readinessState = {
          hostReady: true,
          totalParticipants: allParticipants.length,
          readyParticipants: [userName],
          timestamp: Date.now(),
        };

        await redis.set(
          REDIS_KEYS.recordingReadiness(meetingName),
          JSON.stringify(readinessState),
          "EX",
          60
        );

        await redis.set(
          REDIS_KEYS.participantReady(meetingName, userName),
          "true",
          "EX",
          60
        );

        socket.emit("host-health-check-passed", {
          message: "Your connection is good",
        });

        if (otherParticipants.length > 0) {
          console.log(
            `📡 Checking ${otherParticipants.length} participants...`
          );

          io.to(meetingName).emit("participants-health-check-required", {
            participants: allParticipants,
            timeout: 10000,
          });

          setTimeout(async () => {
            await checkReadinessTimeout(meetingName, allParticipants);
          }, 10000);
        } else {
          await startRecordingForMeeting(meetingName);
        }
      } catch (error) {
        socket.emit("host-health-check-failed", {
          reason: "Some issue with your network connection..",
        });
      }
    });

    socket.on(
      "participant-test-chunk",
      async ({ meetingName, userName, chunk }) => {
        try {
          if (!chunk || chunk.byteLength === 0) {
            socket.emit("participant-health-check-failed", {
              reason: "Empty test chunk",
            });
            return;
          }

          // ✅ CHECK VOLUME FOR PARTICIPANTS TOO
          const pcmData = new Int16Array(chunk);
          const maxVolume = Math.max(...pcmData.map(Math.abs));
          const avgVolume =
            pcmData.reduce((sum, val) => sum + Math.abs(val), 0) /
            pcmData.length;

          console.log(`🔊 ${userName} volume check:`, {
            maxVolume,
            avgVolume,
          });

          const MIN_VOLUME_THRESHOLD = 200;

          if (maxVolume < MIN_VOLUME_THRESHOLD) {
            socket.emit("participant-health-check-failed", {
              reason: "Microphone appears to be muted or not picking up sound",
              details: {
                maxVolume,
                required: MIN_VOLUME_THRESHOLD,
              },
            });
            return;
          }

          console.log(
            `✅ ${userName} health check passed (${chunk.byteLength} bytes, volume: ${maxVolume})`
          );

          await redis.set(
            REDIS_KEYS.participantReady(meetingName, userName),
            "true",
            "EX",
            60
          );

          const stateData = await redis.get(
            REDIS_KEYS.recordingReadiness(meetingName)
          );

          if (!stateData) {
            console.warn(`⚠️ No readiness state for ${meetingName}`);
            return;
          }

          const state = JSON.parse(stateData);

          if (!state.readyParticipants.includes(userName)) {
            state.readyParticipants.push(userName);

            await redis.set(
              REDIS_KEYS.recordingReadiness(meetingName),
              JSON.stringify(state),
              "EX",
              60
            );

            io.to(meetingName).emit("readiness-progress", {
              ready: state.readyParticipants.length,
              total: state.totalParticipants,
              readyUsers: state.readyParticipants,
            });

            console.log(
              `📊 Readiness: ${state.readyParticipants.length}/${state.totalParticipants}`
            );

            if (state.readyParticipants.length === state.totalParticipants) {
              await startRecordingForMeeting(meetingName);
            }
          }

          socket.emit("participant-health-check-passed", {
            message: "Your connection is good",
          });
        } catch (error) {
          socket.emit("participant-health-check-failed", {
            reason: "Some issue with your network connection..",
          });
        }
      }
    );

    socket.on("recording-started", async (data) => {
      io.to(data.meetingName).emit("recording-started", {
        ...data,
      });
      console.log(`🎬 Recording started in ${data.meetingName}`);
    });

    socket.on("recording-stopped", async (data) => {
      io.to(data.meetingName).emit("recording-stopped", data);
      console.log(`🎬 Recording stoped in ${data.meetingName}`);
    });

    socket.on("audio-mute-during-recording", async (data) => {
      io.to(data.meetingName).emit("audio-mute-during-recording", data);
    });

    socket.on("audio-unmute-during-recording", async (data) => {
      io.to(data.meetingName).emit("audio-unmute-during-recording", data);
    });

    socket.on("leave-meeting", async ({ meetingName, userName }) => {
      socket.leave(meetingName);

      closeWriteStream(socket.id);
      await deleteAudioStream(meetingName, userName);

      await deleteUserSession(meetingName, userName);
      await clearPendingDisconnect(meetingName, userName);
      await handleMeetingLeave(meetingName, userName);

      io.to(meetingName).emit("participant-leave", {
        meetingName,
        stoppedBy: userName,
        userName,
      });

      console.log(`👋 ${userName} left ${meetingName}`);
      const room = io.sockets.adapter.rooms.get(meetingName);
      if (!room || room.size === 0) {
        await updateMeeting(meetingName);
        await deleteMeetingData(meetingName);
      }
    });

    socket.on("disconnect", async (reason) => {
      console.log(`🔌 Socket disconnected: ${socket.id}, reason: ${reason}`);

      try {
        const userInfo = await getUserSessionBySocketId(socket.id);

        if (!userInfo) {
          return;
        }

        const { session, meetingName } = userInfo;
        const { userName } = session;

        const currentSession = await getUserSession(meetingName, userName);

        if (!currentSession || currentSession.socketId !== socket.id) {
          console.log(`⚠️ Socket ${socket.id} is not current for ${userName}`);
          return;
        }

        const disconnectTime = Date.now();

        // ✅ CHECK IF RECORDING IS ACTIVE
        const activeRecording = await prisma.recordingSession.findFirst({
          where: { meetingName, isRecording: true },
        });

        if (activeRecording) {
          // ✅ LOG DISCONNECTION WITH RECORDING NUMBER
          await logDisconnection(
            meetingName,
            userName,
            activeRecording.recordingNumber,
            disconnectTime
          );
        }

        // ✅ CLOSE STREAM IMMEDIATELY (prevent corrupted file)
        await closeWriteStream(socket.id);

        await markPendingDisconnect(meetingName, userName, socket.id);
        console.log(`⏱️ Marked ${userName} as pending disconnect`);

        socket.leave(meetingName);
        await handleMeetingLeave(meetingName, userName);

        const room = io.sockets.adapter.rooms.get(meetingName);
        if (!room || room.size === 0) {
          await updateMeeting(meetingName);
          await deleteMeetingData(meetingName);
        }
      } catch (error) {
        console.error("❌ Error handling disconnect:", error);
      }
    });
  });
};

const s3Client = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

const mapUsernameToDbUser = async (
  username: string
): Promise<number | null> => {
  try {
    const user = await prisma.user.findUnique({
      where: { username },
    });

    if (user) {
      return user.id;
    }

    console.warn(`⚠️ Could not find user: ${username}`);
    return null;
  } catch (error) {
    console.error("Error mapping user:", error);
    return null;
  }
};

const redis = new Redis(process.env.REDIS_URL);

const getChunkTimestamps = async (
  meetingName: string,
  userName: string,
  recordingNumber: number
): Promise<ChunkTimestamp[]> => {
  const key = `chunk-timestamps:${meetingName}:${userName}:${recordingNumber}`;
  const items = await redis.lrange(key, 0, -1);
  return items.map((item: any) => JSON.parse(item));
};

localRecordingQueue.process("process-local-recording", async (job: any) => {
  const { meetingName, recordingNumber, recordings } = job.data;

  console.log(`📥 Processing local recording: ${meetingName}`);
  console.log(`   Recording #${recordingNumber}`);
  console.log(`   Files: ${recordings.length}`);
  console.log(`   Attempt: ${job.attemptsMade + 1}`);

  try {
    const meeting = await prisma.meeting.findUnique({
      where: { sessionName: meetingName },
      include: { participants: true },
    });

    if (!meeting) {
      throw new Error(`Meeting not found: ${meetingName}`);
    }

    const dialects = meeting.participants.map(
      (p: { dialect: string | null }) => p.dialect || "Unknown"
    );

    let session = await prisma.recordingSession.findFirst({
      where: {
        meetingName,
        recordingNumber,
      },
    });

    // ✅ GET ALL CHUNK TIMESTAMPS
    const allChunkTimestamps: Record<number, any[]> = {};

    for (const rec of recordings) {
      const chunks = await getChunkTimestamps(
        meetingName,
        rec.userName,
        recordingNumber
      );
      allChunkTimestamps[rec.participantNumber] = chunks;
    }

    // ✅ ANALYZE TIMING GAPS
    let timingGaps = null;
    if (recordings.length === 2) {
      timingGaps = analyzeTimingGaps(
        allChunkTimestamps[1],
        allChunkTimestamps[2]
      );

      console.log(`📊 Analyzed ${timingGaps.length} chunk pairs`);
      console.log(
        `   Average time difference: ${
          timingGaps
            .filter((g) => g.difference !== null)
            .reduce((sum, g) => sum + Math.abs(g.difference), 0) /
          timingGaps.filter((g) => g.difference !== null).length
        }ms`
      );
    }

    const meetings_date = meeting.createdAt
      .toLocaleString("en-CA", {
        timeZone: "America/Los_Angeles",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      })
      .replace(/,/g, "")
      .replace(/\s+/g, "-")
      .toLowerCase();

    const folder_name = `${meetings_date}/${meeting.createdAt
      .toLocaleString("en-CA", {
        timeZone: "America/Los_Angeles",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      })
      .replace(/,/g, "")
      .replace(/\s+/g, "-")
      .toLowerCase()}`;

    console.log(`📁 Using folder from meeting createdAt: ${folder_name}`);

    const s3Bucket = process.env.S3_BUCKET_NAME!;

    // ✅ COLLECT DISCONNECTIONS FOR EACH PARTICIPANT
    const participantDisconnections: Record<number, any[]> = {};

    // Process each recording
    for (const rec of recordings) {
      console.log(`📤 Uploading ${rec.userName}'s recording...`);

      // ✅ STORE DISCONNECTIONS BY PARTICIPANT NUMBER
      if (rec.disconnectionPeriods && rec.disconnectionPeriods.length > 0) {
        participantDisconnections[rec.participantNumber] =
          rec.disconnectionPeriods;
        console.log(
          `📊 Participant ${rec.participantNumber} has ${rec.disconnectionPeriods.length} disconnection(s)`
        );
      }

      // Read file
      const fileBuffer = fs.readFileSync(rec.filepath);

      // Upload to S3
      const s3Key = `${meeting.language}/${folder_name}/recording-${recordingNumber}/participant-${rec.participantNumber}.webm`;

      await s3Client.send(
        new PutObjectCommand({
          Bucket: s3Bucket,
          Key: s3Key,
          Body: fileBuffer,
          ContentType: "audio/webm",
        })
      );

      const s3Url = `https://${s3Bucket}.s3.${process.env.AWS_REGION}.amazonaws.com/${s3Key}`;

      console.log(`✅ Uploaded to S3: ${s3Key}`);

      // Get user ID
      const dbUserId = await mapUsernameToDbUser(rec.userName);

      // Save to database
      const recording = await prisma.recording.create({
        data: {
          meetingName,
          recordingNumber,
          participantNumber: rec.participantNumber,
          recordingStartTime: rec.startTime,
          s3Key,
          s3Url,
          status: "completed",
          userId: dbUserId,
        },
      });

      const conversation = await prisma.conversation.create({
        data: {
          meetingId: meeting.id,
          userId: dbUserId,
          recordingId: recording.id,
          participantDialects: dialects,
          duration: 0.0,
          quality: 0.0,
          earnings: 0.0,
          status: "incomplete",
          notes: `Conversation recording ${recordingNumber}`,
          startTime: rec.startTime,
          endTime: rec.endTime,
        },
      });

      console.log(`✅ Saved to database (Recording ID: ${recording.id})`);

      // Delete local file
      try {
        fs.unlinkSync(rec.filepath);
        console.log(`🗑️ Deleted local file: ${rec.filepath}`);
      } catch (err) {
        console.warn(`⚠️ Could not delete local file: ${err}`);
      }
    }

    // Update session status
    await prisma.recordingSession.update({
      where: { id: session.id },
      data: { status: "completed" },
    });

    console.log(`✅ Session ${recordingNumber} marked as completed`);

    // Queue transcript processing
    await transcriptQueue.add(
      "process-transcripts",
      {
        meetingName,
        recordingNumber,
        folder_name,
        sessionId: session.id,
        disconnections: participantDisconnections, // ✅ ADD THIS
        timingGaps, // ✅ ADD THIS
      },
      {
        jobId: `transcript-${meetingName}-${recordingNumber}`,
        priority: 1,
      }
    );

    // ✅ CLEANUP CHUNK TIMESTAMPS
    for (const rec of recordings) {
      await redis.del(
        `chunk-timestamps:${meetingName}:${rec.userName}:${recordingNumber}`
      );
    }

    console.log(
      `🎯 Queued transcript processing for session ${recordingNumber}`
    );

    // Clean up Redis
    const local_recording_queu_redis = localRecordingQueue.client;
    await local_recording_queu_redis.del(
      `session:recordings:${meetingName}:${recordingNumber}`
    );

    return {
      success: true,
      meetingName,
      recordingNumber,
      filesProcessed: recordings.length,
    };
  } catch (error: any) {
    console.error(`❌ Error processing recording:`, error);
    throw error;
  }
});

localRecordingQueue.on("completed", (job: any, result: any) => {
  console.log(`✅ Local recording job ${job.id} completed:`, result);
});

localRecordingQueue.on("failed", (job: any, err: any) => {
  console.error(
    `❌ Local recording job ${job.id} failed after ${job.attemptsMade} attempts:`,
    err.message
  );
});

localRecordingQueue.on("stalled", (job: any) => {
  console.warn(`⚠️ Local recording job ${job.id} stalled`);
});
