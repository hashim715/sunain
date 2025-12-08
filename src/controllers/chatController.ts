import { Application } from "express";
import http from "http";
import { Server, Socket } from "socket.io";
import Redis from "ioredis";
import { createAdapter } from "@socket.io/redis-adapter";
import { prisma } from "../config/postgres";
import dotenv from "dotenv";

dotenv.config();

interface MeetingState {
  topicIndex: number;
  subtopicIndex: number | null;
  completedTopics: number[];
}

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

  const disconnectTimeouts = new Map<string, NodeJS.Timeout>();
  const RECONNECTION_GRACE_PERIOD = 30000;

  const REDIS_KEYS = {
    meetingStartTime: (meetingName: string) =>
      `meeting:${meetingName}:startTime`,
    meetingState: (meetingName: string) => `meeting:${meetingName}:state`,
    socketUserInfo: (socketId: string) => `socket:${socketId}:userInfo`,
    meetingRecording: (meetingName: string) =>
      `meeting:${meetingName}:recording`,
    userSocket: (meetingName: string, zoomUserId: string) =>
      `user:${meetingName}:${zoomUserId}:socket`,
  };

  const getMeetingStartTime = async (
    meetingName: string
  ): Promise<number | null> => {
    const startTime = await redis.get(REDIS_KEYS.meetingStartTime(meetingName));
    return startTime ? parseInt(startTime) : null;
  };

  const setMeetingStartTime = async (
    meetingName: string,
    timestamp: number
  ): Promise<void> => {
    await redis.set(
      REDIS_KEYS.meetingStartTime(meetingName),
      timestamp,
      "EX",
      86400
    );
  };

  const getMeetingState = async (meetingName: string) => {
    const state = await redis.get(REDIS_KEYS.meetingState(meetingName));
    return state ? JSON.parse(state) : null;
  };

  const setMeetingState = async (
    meetingName: string,
    state: any
  ): Promise<void> => {
    await redis.set(
      REDIS_KEYS.meetingState(meetingName),
      JSON.stringify(state),
      "EX",
      86400
    );
  };

  const setSocketUserInfo = async (
    socketId: string,
    userInfo: {
      meetingName: string;
      userName: string;
      isHost: boolean;
      sessionID: string;
      jwtToken: string;
      zoomUserId: string;
    }
  ): Promise<void> => {
    await redis.set(
      REDIS_KEYS.socketUserInfo(socketId),
      JSON.stringify(userInfo),
      "EX",
      86400
    );
  };

  const getSocketUserInfo = async (socketId: string) => {
    const info = await redis.get(REDIS_KEYS.socketUserInfo(socketId));
    return info ? JSON.parse(info) : null;
  };

  const deleteSocketUserInfo = async (socketId: string): Promise<void> => {
    await redis.del(REDIS_KEYS.socketUserInfo(socketId));
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

  const setUserSocket = async (
    meetingName: string,
    zoomUserId: string,
    socketId: string
  ): Promise<void> => {
    await redis.set(
      REDIS_KEYS.userSocket(meetingName, zoomUserId),
      socketId,
      "EX",
      86400
    );
  };

  const getUserSocket = async (
    meetingName: string,
    zoomUserId: string
  ): Promise<string | null> => {
    return await redis.get(REDIS_KEYS.userSocket(meetingName, zoomUserId));
  };

  const deleteUserSocket = async (
    meetingName: string,
    zoomUserId: string
  ): Promise<void> => {
    await redis.del(REDIS_KEYS.userSocket(meetingName, zoomUserId));
  };

  const deleteMeetingData = async (meetingName: string): Promise<void> => {
    await redis.del(REDIS_KEYS.meetingStartTime(meetingName));
    await redis.del(REDIS_KEYS.meetingState(meetingName));
    await redis.del(REDIS_KEYS.meetingRecording(meetingName));
  };

  const updateMeeting = async (meetingName: string) => {
    try {
      const now = new Date();

      await prisma.meeting.update({
        where: { sessionName: meetingName },
        data: { isActive: false, endedAt: now },
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
        `Meeting ${meetingName} ended for participant ${userName}. Duration: ${durationMinutes} minutes.`
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

        const userKey = `${meetingName}:${zoomUserId}`;

        if (isReconnect) {
          const existingTimeout = disconnectTimeouts.get(userKey);
          if (existingTimeout) {
            clearTimeout(existingTimeout);
            disconnectTimeouts.delete(userKey);
            console.log(`✅ Cleared disconnect timeout for ${userName}`);
          }
        }

        await setUserSocket(meetingName, zoomUserId, socket.id);

        await setSocketUserInfo(socket.id, {
          meetingName,
          userName,
          isHost,
          sessionID,
          jwtToken,
          zoomUserId,
        });

        if (isReconnect) {
          io.to(meetingName).emit("refresh-participants", {
            zoomUserId,
            userName,
            isHost,
          });
        }

        try {
          const existingStartTime = await getMeetingStartTime(meetingName);

          if (isHost && !existingStartTime) {
            await setMeetingStartTime(meetingName, timestamp);

            const initialState: MeetingState = {
              topicIndex: 0,
              subtopicIndex: null,
              completedTopics: [],
            };
            await setMeetingState(meetingName, initialState);
          }

          const startTime = await getMeetingStartTime(meetingName);
          if (startTime) {
            socket.emit("meeting-time-sync", { startTime });
          }
        } catch (error) {
          console.error("❌ Error in join-meeting:", error);
        }
      }
    );

    socket.on("restore-recording-state", async (data) => {
      const { meetingName, userName, zoomUserId } = data;
      const userKey = `${meetingName}:${zoomUserId}`;

      const existingTimeout = disconnectTimeouts.get(userKey);
      if (existingTimeout) {
        clearTimeout(existingTimeout);
        disconnectTimeouts.delete(userKey);
        console.log(`✅ Recording state restored for ${userName}`);
      }
    });

    socket.on("check-can-join", async ({ meetingName }, callback) => {
      try {
        const room = io.sockets.adapter.rooms.get(meetingName);
        const participantCount = room ? room.size : 0;

        const MAX_PARTICIPANTS = 2;
        const canJoin = participantCount < MAX_PARTICIPANTS;

        callback({
          success: true,
          participantCount,
          maxParticipants: MAX_PARTICIPANTS,
          canJoin,
        });
      } catch (error) {
        console.error("Error checking participant count:", error);
        callback({
          success: false,
          error: "Failed to check participant count",
        });
      }
    });

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

    socket.on("request-meeting-time", async ({ meetingName }) => {
      try {
        const startTime = await getMeetingStartTime(meetingName);
        if (startTime) {
          socket.emit("meeting-time-sync", { startTime });
        }
      } catch (error) {
        console.error("❌ Error in request-meeting-time:", error);
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
      await setMeetingRecordingState(data.meetingName, true);
      socket.to(data.meetingName).emit("recording-started", data);
    });

    socket.on("recording-stopped", async (data) => {
      await setMeetingRecordingState(data.meetingName, false);
      socket.to(data.meetingName).emit("recording-stopped", data);
    });

    socket.on("audio-mute-during-recording", async (data) => {
      io.to(data.meetingName).emit("audio-mute-during-recording", data);
    });

    socket.on("audio-unmute-during-recording", async (data) => {
      io.to(data.meetingName).emit("audio-unmute-during-recording", data);
    });

    socket.on("leave-meeting", async ({ meetingName, userName }) => {
      socket.leave(meetingName);
      await deleteSocketUserInfo(socket.id);
      await handleMeetingLeave(meetingName, userName);

      const room = io.sockets.adapter.rooms.get(meetingName);
      if (!room || room.size === 0) {
        await updateMeeting(meetingName);
      }
    });

    socket.on("disconnect", async (reason) => {
      console.log(`🔌 Socket disconnected: ${socket.id}, reason: ${reason}`);

      try {
        const userInfo = await getSocketUserInfo(socket.id);

        if (!userInfo) {
          console.log("⚠️ No user info found for disconnected socket");
          return;
        }

        const {
          meetingName,
          userName,
          isHost,
          sessionID,
          jwtToken,
          zoomUserId,
        } = userInfo;

        const userKey = `${meetingName}:${zoomUserId}`;

        const currentSocket = await getUserSocket(meetingName, zoomUserId);

        if (currentSocket !== socket.id) {
          console.log(
            `⚠️ Socket ${socket.id} is not current for user ${userName}, skipping disconnect handling`
          );
          await deleteSocketUserInfo(socket.id);
          return;
        }

        const timeout = setTimeout(async () => {
          console.log(
            `⏰ Grace period expired for ${userName} - notifying participants`
          );

          const latestSocket = await getUserSocket(meetingName, zoomUserId);
          if (latestSocket === socket.id) {
            io.to(meetingName).emit("refresh-participants-required", {
              message: "Participant disconnected and didn't reconnect.",
              meetingName,
              userName: userName,
              zoomUserId: zoomUserId,
            });

            await deleteUserSocket(meetingName, zoomUserId);
            disconnectTimeouts.delete(userKey);
          } else {
            console.log(
              `✅ ${userName} reconnected with new socket, skipping notification`
            );
          }
        }, RECONNECTION_GRACE_PERIOD);

        disconnectTimeouts.set(userKey, timeout);
        console.log(
          `⏱️ Started ${RECONNECTION_GRACE_PERIOD}ms grace period for ${userName}`
        );

        socket.leave(meetingName);
        await deleteSocketUserInfo(socket.id);

        await handleMeetingLeave(meetingName, userName);

        const room = io.sockets.adapter.rooms.get(meetingName);
        if (!room || room.size === 0) {
          await updateMeeting(meetingName);
          for (const [key, timeout] of disconnectTimeouts.entries()) {
            if (key.startsWith(`${meetingName}:`)) {
              clearTimeout(timeout);
              disconnectTimeouts.delete(key);
            }
          }
        }
      } catch (error) {
        console.error("❌ Error handling disconnect:", error);
      }
    });
  });
};
