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
import axios from "axios";

dotenv.config();

interface MeetingState {
  topicIndex: number;
  subtopicIndex: number | null;
  completedTopics: number[];
}

interface UserSession {
  meetingName: string;
  userName: string;
  isHost: boolean;
  sessionID: string;
  jwtToken: string;
  zoomUserId: string;
  socketId: string;
  lastSeen: number;
}

interface AudioStreamInfo {
  filepath: string;
  startedAt: number;
  participantNumber: number;
  recordingNumber: number; // ✅ Add this
}

interface RecordingMetadata {
  meetingName: string;
  recordingNumber: number;
  userName: string;
  filepath: string;
  participantNumber: number;
  startTime: Date;
  endTime: Date;
}

// Create local recording queue
export const localRecordingQueue = new Queue("local-recordings", {
  redis: {
    host: process.env.REDIS_HOST || "localhost",
    port: parseInt(process.env.REDIS_PORT || "6379"),
  },
  defaultJobOptions: {
    attempts: 5,
    backoff: { type: "exponential", delay: 5000 },
    removeOnComplete: 100,
    removeOnFail: 500,
  },
});

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

  const RECONNECTION_GRACE_PERIOD = 30000; // 30 seconds
  const CLEANUP_CHECK_INTERVAL = 5000; // 5 seconds

  const uploadsDir = path.join(__dirname, "..", "audio-recordings");
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }

  const activeWriteStreams = new Map<string, fs.WriteStream>();

  const REDIS_KEYS = {
    meetingState: (meetingName: string) => `meeting:${meetingName}:state`,

    meetingRecording: (meetingName: string) =>
      `meeting:${meetingName}:recording`,

    userSession: (meetingName: string, zoomUserId: string) =>
      `session:${meetingName}:${zoomUserId}`,

    pendingDisconnect: (meetingName: string, zoomUserId: string) =>
      `disconnect:${meetingName}:${zoomUserId}`,

    audioStream: (meetingName: string, userName: string) =>
      `audio:${meetingName}:${userName}`,

    recordingMetadata: (meetingName: string, recordingNumber: number) =>
      `recording:meta:${meetingName}:${recordingNumber}`,

    sessionRecordings: (meetingName: string, recordingNumber: number) =>
      `session:recordings:${meetingName}:${recordingNumber}`,
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

  const setMeetingRecordingState = async (
    meetingName: string,
    isRecording: boolean
  ): Promise<void> => {
    await redis.set(
      REDIS_KEYS.meetingRecording(meetingName),
      isRecording ? "true" : "false",
      "EX",
      86400
    );
  };

  const getMeetingRecordingState = async (
    meetingName: string
  ): Promise<boolean> => {
    const state = await redis.get(REDIS_KEYS.meetingRecording(meetingName));
    return state === "true";
  };

  const deleteMeetingData = async (meetingName: string): Promise<void> => {
    await redis.del(REDIS_KEYS.meetingState(meetingName));
    await redis.del(REDIS_KEYS.meetingRecording(meetingName));
  };

  const setUserSession = async (
    meetingName: string,
    zoomUserId: string,
    session: UserSession
  ): Promise<void> => {
    await redis.set(
      REDIS_KEYS.userSession(meetingName, zoomUserId),
      JSON.stringify(session),
      "EX",
      86400
    );
  };

  const getUserSession = async (
    meetingName: string,
    zoomUserId: string
  ): Promise<UserSession | null> => {
    const data = await redis.get(
      REDIS_KEYS.userSession(meetingName, zoomUserId)
    );
    return data ? JSON.parse(data) : null;
  };

  const deleteUserSession = async (
    meetingName: string,
    zoomUserId: string
  ): Promise<void> => {
    await redis.del(REDIS_KEYS.userSession(meetingName, zoomUserId));
  };

  // NEW: Store recording metadata for processing
  const addRecordingToSession = async (
    meetingName: string,
    recordingNumber: number,
    metadata: RecordingMetadata
  ): Promise<void> => {
    const key = REDIS_KEYS.sessionRecordings(meetingName, recordingNumber);

    // ✅ Use RPUSH (atomic append) instead of GET+SET
    await redis.rpush(key, JSON.stringify(metadata));

    // Set expiry on first insert
    await redis.expire(key, 172800); // 48 hours

    // Get count atomically
    const count = await redis.llen(key);

    console.log(
      `📝 Added recording metadata for ${metadata.userName} in session ${recordingNumber} (${count} total)`
    );
  };

  const getSessionRecordings = async (
    meetingName: string,
    recordingNumber: number
  ): Promise<RecordingMetadata[]> => {
    const key = REDIS_KEYS.sessionRecordings(meetingName, recordingNumber);

    // ✅ Get all list items
    const items = await redis.lrange(key, 0, -1);

    return items.map((item) => JSON.parse(item));
  };

  const deleteSessionRecordings = async (
    meetingName: string,
    recordingNumber: number
  ): Promise<void> => {
    await redis.del(REDIS_KEYS.sessionRecordings(meetingName, recordingNumber));
  };

  /**
   * Reverse lookup: socket -> user session
   * Used only on disconnect (infrequent operation)
   */
  const getUserSessionBySocketId = async (
    socketId: string
  ): Promise<{
    session: UserSession;
    meetingName: string;
    zoomUserId: string;
  } | null> => {
    const pattern = "session:*";
    const keys = await redis.keys(pattern);

    for (const key of keys) {
      const data = await redis.get(key);
      if (data) {
        const session: UserSession = JSON.parse(data);
        if (session.socketId === socketId) {
          const parts = key.split(":");
          return {
            session,
            meetingName: parts[1],
            zoomUserId: parts[2],
          };
        }
      }
    }
    return null;
  };

  const markPendingDisconnect = async (
    meetingName: string,
    zoomUserId: string,
    socketId: string
  ): Promise<void> => {
    const disconnectTime = Date.now();
    await redis.set(
      REDIS_KEYS.pendingDisconnect(meetingName, zoomUserId),
      JSON.stringify({ socketId, disconnectTime }),
      "PX",
      RECONNECTION_GRACE_PERIOD + 5000
    );
  };

  const getPendingDisconnect = async (
    meetingName: string,
    zoomUserId: string
  ): Promise<{ socketId: string; disconnectTime: number } | null> => {
    const data = await redis.get(
      REDIS_KEYS.pendingDisconnect(meetingName, zoomUserId)
    );
    return data ? JSON.parse(data) : null;
  };

  const clearPendingDisconnect = async (
    meetingName: string,
    zoomUserId: string
  ): Promise<void> => {
    await redis.del(REDIS_KEYS.pendingDisconnect(meetingName, zoomUserId));
  };

  /**
   * Background worker for disconnect cleanup
   * Runs on all server instances, Redis coordinates state
   */
  const startDisconnectCleanupWorker = () => {
    setInterval(async () => {
      try {
        const pattern = "disconnect:*";
        const keys = await redis.keys(pattern);

        for (const key of keys) {
          const data = await redis.get(key);
          if (!data) continue;

          const { socketId, disconnectTime } = JSON.parse(data);
          const elapsed = Date.now() - disconnectTime;

          if (elapsed >= RECONNECTION_GRACE_PERIOD) {
            const parts = key.split(":");
            const meetingName = parts[1];
            const zoomUserId = parts[2];

            const session = await getUserSession(meetingName, zoomUserId);

            if (!session || session.socketId === socketId) {
              console.log(
                `⏰ Grace period expired for ${zoomUserId} in ${meetingName}`
              );

              io.to(meetingName).emit("refresh-participants-required", {
                message: "Participant disconnected and didn't reconnect.",
                meetingName,
                zoomUserId,
                userName: session.userName,
                socketId: session.socketId,
              });

              await deleteUserSession(meetingName, zoomUserId);
              await clearPendingDisconnect(meetingName, zoomUserId);
            } else {
              await clearPendingDisconnect(meetingName, zoomUserId);
            }
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

  /**
   * Get write stream for socket, create if needed
   * Streams are per-socket, not stored in Redis
   */
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

  /**
   * Close and cleanup write stream for socket
   */
  // Update closeWriteStream to return a Promise
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

  io.on("connection", (socket: Socket): void => {
    socket.on(
      "join-meeting",
      async ({
        meetingName,
        userName,
        isHost,
        timestamp,
        sessionID,
        jwtToken,
        zoomUserId,
        isReconnect,
      }) => {
        console.log(
          `👤 ${userName} joining ${meetingName} (reconnect: ${isReconnect})`
        );

        socket.join(meetingName);

        // Clear pending disconnect if reconnecting
        if (isReconnect) {
          const pendingDisconnect = await getPendingDisconnect(
            meetingName,
            zoomUserId
          );
          if (pendingDisconnect) {
            await clearPendingDisconnect(meetingName, zoomUserId);
            console.log(`✅ Cleared pending disconnect for ${userName}`);
          }
        }

        // Store user session
        const session: UserSession = {
          meetingName,
          userName,
          isHost,
          sessionID,
          jwtToken,
          zoomUserId,
          socketId: socket.id,
          lastSeen: Date.now(),
        };

        await setUserSession(meetingName, zoomUserId, session);

        if (isReconnect) {
          io.to(meetingName).emit("refresh-participants", {
            zoomUserId,
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
      async (data: { meetingName: string; userName: string }) => {
        try {
          const { meetingName, userName } = data;

          // Get the current active recording session
          const session = await prisma.recordingSession.findFirst({
            where: {
              meetingName,
              isRecording: true, // Only active sessions
            },
            orderBy: {
              recordingNumber: "desc", // Highest number first
            },
          });

          if (!session) {
            throw new Error("No active recording session found");
          }

          const recordingNumber = session.recordingNumber;

          const meetingDir = path.join(uploadsDir, meetingName);
          if (!fs.existsSync(meetingDir)) {
            fs.mkdirSync(meetingDir, { recursive: true });
          }

          // Get participant number from database
          const meeting = await prisma.meeting.findUnique({
            where: { sessionName: meetingName },
            include: {
              participants: {
                include: { user: true },
                orderBy: { userId: "asc" }, // ✅ Consistent ordering
              },
            },
          });

          const participant = meeting?.participants.find(
            (p) => p.user.username === userName
          );

          if (!participant) {
            throw new Error("Participant not found");
          }

          const participantNumber =
            meeting.participants.indexOf(participant) + 1;

          const timestamp = Date.now();
          const filepath = path.join(
            meetingDir,
            `recording-${recordingNumber}-participant-${participantNumber}.webm`
          );

          const streamInfo: AudioStreamInfo = {
            filepath,
            startedAt: timestamp,
            participantNumber,
            recordingNumber, // ✅ Store it here
          };
          await setAudioStreamInfo(meetingName, userName, streamInfo);

          console.log(
            `✅ Audio stream started: ${userName} (P${participantNumber}) recording #${recordingNumber}`
          );
          console.log(`   File: ${filepath}`);

          socket.emit("audio-stream-ready", { filepath, recordingNumber });
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
        chunk: Buffer;
      }) => {
        try {
          const { meetingName, userName, chunk } = data;

          const streamInfo = await getAudioStreamInfo(meetingName, userName);

          if (!streamInfo) {
            console.warn(
              `⚠️ No active stream for ${userName} in ${meetingName}`
            );
            return;
          }

          const stream = getOrCreateWriteStream(socket.id, streamInfo.filepath);

          if (stream.writable) {
            stream.write(chunk);
          } else {
            console.warn(`⚠️ Write stream not writable for ${userName}`);
          }
        } catch (error) {
          console.error("❌ Error writing audio chunk:", error);
        }
      }
    );

    socket.on(
      "stop-audio-stream",
      async (data: {
        meetingName: string;
        userName: string;
        socketId: string | null;
      }) => {
        try {
          const { meetingName, userName, socketId } = data;

          console.log(`🛑 Stop request from ${userName}`);

          const streamInfo = await getAudioStreamInfo(meetingName, userName);

          if (!streamInfo) {
            console.warn(`⚠️ No stream info for ${userName}`);
            socket.emit("audio-stream-error", {
              message: "No active stream found",
            });
            return;
          }

          // ✅ WAIT for stream to close and flush to disk
          if (socketId === null) {
            await closeWriteStream(socket.id);
          } else {
            await closeWriteStream(socketId);
          }

          console.log(`✅ Stream flushed to disk for ${userName}`);

          const recordingNumber = streamInfo.recordingNumber;

          console.log(`🔍 Stream info:`, {
            recordingNumber,
            participantNumber: streamInfo.participantNumber,
            filepath: streamInfo.filepath,
          });

          // Add a small delay to ensure filesystem sync (especially in Docker)
          await new Promise((resolve) => setTimeout(resolve, 100));

          // Verify file exists
          if (!fs.existsSync(streamInfo.filepath)) {
            console.error(`❌ File not found: ${streamInfo.filepath}`);

            // List directory contents for debugging
            const dir = path.dirname(streamInfo.filepath);
            if (fs.existsSync(dir)) {
              const files = fs.readdirSync(dir);
              console.log(`📁 Directory contents:`, files);
            } else {
              console.log(`📁 Directory doesn't exist: ${dir}`);
            }

            throw new Error(`Recording file not found: ${streamInfo.filepath}`);
          }

          const stats = fs.statSync(streamInfo.filepath);
          console.log(
            `✅ File verified: ${streamInfo.filepath} (${stats.size} bytes)`
          );

          // Check if file has content
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
          };

          console.log(`📝 Saving metadata:`, {
            recordingNumber,
            participantNumber: streamInfo.participantNumber,
            filepath: streamInfo.filepath,
            fileSize: stats.size,
          });

          await addRecordingToSession(
            meetingName,
            recordingNumber,
            recordingMetadata
          );

          await deleteAudioStream(meetingName, userName);

          console.log(
            `🛑 Recording #${recordingNumber} stopped for ${userName} (${duration}ms, ${stats.size} bytes)`
          );

          const session = await prisma.recordingSession.findFirst({
            where: {
              meetingName,
              recordingNumber,
            },
          });

          if (!session) {
            console.warn(
              `⚠️ Session not found: ${meetingName} #${recordingNumber}`
            );
            return;
          }

          const sessionRecordings = await getSessionRecordings(
            meetingName,
            recordingNumber
          );

          console.log(
            `📊 Session progress: ${sessionRecordings.length}/${session.participantCount}`
          );

          if (sessionRecordings.length === session.participantCount) {
            console.log(
              `✅ All ${sessionRecordings.length} recordings complete for session ${recordingNumber}`
            );

            console.log("🔍 Verifying all files before queueing...");
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

            // ✅ Fixed jobId without timestamp - Bull prevents duplicates
            const jobId = `local-${meetingName}-${recordingNumber}`;

            try {
              await localRecordingQueue.add(
                "process-local-recording",
                {
                  meetingName,
                  recordingNumber,
                  recordings: sessionRecordings,
                },
                {
                  jobId, // Same ID = Bull rejects duplicate
                  priority: 1,
                }
              );

              console.log(
                `🎯 Queued processing for ${meetingName} recording ${recordingNumber}`
              );
            } catch (error: any) {
              // Bull throws if duplicate job already exists
              if (
                error.message?.includes("already exists") ||
                error.message?.includes("duplicate")
              ) {
                console.log(`⏭️ Job already queued, skipping`);
              } else {
                throw error;
              }
            }
          } else {
            console.log(
              `⏳ Waiting: ${sessionRecordings.length}/${session.participantCount}`
            );
          }

          socket.emit("audio-stream-stopped", {
            filepath: streamInfo.filepath,
            duration,
            recordingNumber,
          });
        } catch (error) {
          console.error("❌ Error stopping audio stream:", error);
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

    socket.on("recording-started", async (data) => {
      io.to(data.meetingName).emit("recording-started", {
        ...data,
      });
      console.log(`🎬 Recording started in ${data.meetingName}`);
    });

    socket.on("recording-stopped", async (data) => {
      await setMeetingRecordingState(data.meetingName, false);
      socket.to(data.meetingName).emit("recording-stopped", data);
      console.log(`🎬 Recording stoped in ${data.meetingName}`);
    });

    socket.on("audio-mute-during-recording", async (data) => {
      io.to(data.meetingName).emit("audio-mute-during-recording", data);
    });

    socket.on("audio-unmute-during-recording", async (data) => {
      io.to(data.meetingName).emit("audio-unmute-during-recording", data);
    });

    socket.on(
      "leave-meeting",
      async ({ meetingName, userName, zoomUserId }) => {
        socket.leave(meetingName);

        closeWriteStream(socket.id);
        await deleteAudioStream(meetingName, userName);

        await deleteUserSession(meetingName, zoomUserId);
        await clearPendingDisconnect(meetingName, zoomUserId);
        await handleMeetingLeave(meetingName, userName);

        io.to(meetingName).emit("participant-leave", {
          meetingName,
          stoppedBy: userName,
          zoomUserId,
        });

        console.log(`👋 ${userName} left ${meetingName}`);
        const room = io.sockets.adapter.rooms.get(meetingName);
        if (!room || room.size === 0) {
          await updateMeeting(meetingName);
          await deleteMeetingData(meetingName);
        }
      }
    );

    socket.on("disconnect", async (reason) => {
      console.log(`🔌 Socket disconnected: ${socket.id}, reason: ${reason}`);

      // closeWriteStream(socket.id);

      try {
        const userInfo = await getUserSessionBySocketId(socket.id);

        if (!userInfo) {
          return;
        }

        const { session, meetingName, zoomUserId } = userInfo;
        const { userName } = session;

        // await deleteAudioStream(meetingName, userName);

        const currentSession = await getUserSession(meetingName, zoomUserId);

        if (!currentSession || currentSession.socketId !== socket.id) {
          console.log(`⚠️ Socket ${socket.id} is not current for ${userName}`);
          return;
        }

        await markPendingDisconnect(meetingName, zoomUserId, socket.id);
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

    const dialects = meeting.participants.map((p) => p.dialect || "Unknown");

    let session = await prisma.recordingSession.findFirst({
      where: {
        meetingName,
        recordingNumber,
      },
    });

    // ✅ Generate folder name from meeting createdAt
    const folder_name = meeting.createdAt
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
      .toLowerCase();

    console.log(`📁 Using folder from meeting createdAt: ${folder_name}`);

    const s3Bucket = process.env.S3_BUCKET_NAME!;

    // Process each recording
    for (const rec of recordings) {
      console.log(`📤 Uploading ${rec.userName}'s recording...`);

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
      },
      {
        jobId: `transcript-${meetingName}-${recordingNumber}`,
        priority: 1,
      }
    );

    console.log(
      `🎯 Queued transcript processing for session ${recordingNumber}`
    );

    // Clean up Redis
    const redis = localRecordingQueue.client;
    await redis.del(`session:recordings:${meetingName}:${recordingNumber}`);

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
