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

  const REDIS_KEYS = {
    meetingStartTime: (meetingName: string) =>
      `meeting:${meetingName}:startTime`,
    meetingState: (meetingName: string) => `meeting:${meetingName}:state`,
    socketUserInfo: (socketId: string) => `socket:${socketId}:userInfo`,
    meetingRecording: (meetingName: string) =>
      `meeting:${meetingName}:recording`,
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

  const deleteMeetingData = async (meetingName: string): Promise<void> => {
    await redis.del(REDIS_KEYS.meetingStartTime(meetingName));
    await redis.del(REDIS_KEYS.meetingState(meetingName));
    await redis.del(REDIS_KEYS.meetingRecording(meetingName));
  };

  const handleParticipantLeft = async (meetingName: string) => {
    try {
      const currentSession = await prisma.recordingSession.findFirst({
        where: {
          meetingName,
          isRecording: true,
          status: "active",
        },
        orderBy: { recordingNumber: "desc" },
      });

      if (!currentSession) {
        console.log(`⚠️ No active recording session found for: ${meetingName}`);
        return false;
      }

      await prisma.recordingSession.update({
        where: { id: currentSession.id },
        data: {
          isRecording: false,
          status: "interrupted",
          recordingEndTime: new Date(),
        },
      });

      console.log(
        `✅ Marked recording ${currentSession.recordingNumber} as interrupted`
      );

      return true;
    } catch (error) {
      console.error("❌ Error stopping recording via API:", error);
      return false;
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
        socket.join(meetingName);

        await setSocketUserInfo(socket.id, {
          meetingName,
          userName,
          isHost,
          sessionID,
          jwtToken,
          zoomUserId,
        });

        if (isReconnect) {
          console.log(`🔄 ${userName} reconnected to ${meetingName}`);

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

    socket.on("leave-meeting", async ({ meetingName }) => {
      socket.leave(meetingName);

      await deleteSocketUserInfo(socket.id);

      const room = io.sockets.adapter.rooms.get(meetingName);
      if (!room || room.size === 0) {
        await deleteMeetingData(meetingName);
        console.log(`🗑️ Cleaned up data for empty meeting: ${meetingName}`);
      }
    });

    socket.on("disconnect", async () => {
      try {
        const userInfo = await getSocketUserInfo(socket.id);

        if (userInfo) {
          const {
            meetingName,
            userName,
            isHost,
            sessionID,
            jwtToken,
            zoomUserId,
          } = userInfo;

          io.to(meetingName).emit("refresh-participants-required", {
            message: "Host disconnected. Please rejoin the meeting.",
            meetingName,
            userName: userName,
            zoomUserId: zoomUserId,
          });

          // if (isHost) {
          //   const isRecording = await getMeetingRecordingState(meetingName);

          //   if (isRecording) {
          //     const participant_left = await handleParticipantLeft(meetingName);
          //     if (participant_left) {
          //       const stopped = false;
          //       await setMeetingRecordingState(meetingName, false);

          //       io.to(meetingName).emit("host-disconnected-rejoin-required", {
          //         message: "Host disconnected. Please rejoin the meeting.",
          //         meetingName,
          //         userName: userName,
          //       });
          //     } else {
          //       console.log("Failed to update recording session as interupted");
          //     }
          //   } else {
          //     console.log(`ℹ️ No active recording - no action needed`);
          //   }
          // } else {
          //   console.log(
          //     `ℹ️ Participant disconnected - Zoom SDK will handle on host side`
          //   );
          // }

          socket.leave(meetingName);
          await deleteSocketUserInfo(socket.id);

          const room = io.sockets.adapter.rooms.get(meetingName);
          if (!room || room.size === 0) {
            await deleteMeetingData(meetingName);
            console.log(`🗑️ Cleaned up data for empty meeting: ${meetingName}`);
          }
        }
      } catch (error) {
        console.error("❌ Error handling disconnect:", error);
      }
    });
  });
};
