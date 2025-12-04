import { Application } from "express";
import http from "http";
import { Server, Socket } from "socket.io";
import Redis from "ioredis";
import { createAdapter } from "@socket.io/redis-adapter";

// export const chatController = async (
//   app: Application,
//   server: http.Server
// ): Promise<void> => {
//   const io = new Server(server, {
//     cors: { origin: "*", methods: ["GET", "POST"] },
//   });

//   const pubClient = new Redis(process.env.REDIS_URL);
//   const subClient = pubClient.duplicate();

//   io.adapter(createAdapter(pubClient, subClient));

//   const redis = new Redis(process.env.REDIS_URL);

//   const getRoomUsers = async (roomId: string) => {
//     const members = await redis.smembers(`room:${roomId}`);
//     return members.map((m) => JSON.parse(m));
//   };

//   const removeUserFromRoom = async (roomId: string, socketId: string) => {
//     const users = await getRoomUsers(roomId);
//     const userToRemove = users.find((u) => u.socketId === socketId);
//     if (userToRemove) {
//       await redis.srem(`room:${roomId}`, JSON.stringify(userToRemove));
//       return userToRemove;
//     }
//     return null;
//   };

//   io.on("connection", (socket: Socket): void => {
//     // socket.on("join-room", async ({ roomId, user }) => {
//     //   socket.join(roomId);

//     //   const existingUsers = await getRoomUsers(roomId);
//     //   const alreadyInRoom = existingUsers.some((u) => u.id === user.id);
//     //   if (!alreadyInRoom) {
//     //     await redis.sadd(
//     //       `room:${roomId}`,
//     //       JSON.stringify({ ...user, socketId: socket.id })
//     //     );
//     //   }

//     //   socket.to(roomId).emit("user_joined", { remote_user: user });

//     //   const updatedUsers = await getRoomUsers(roomId);
//     //   socket.emit("existing-users", {
//     //     users: updatedUsers.filter((u) => u.id !== user.id),
//     //   });
//     // });

//     // socket.on("disconnect", async () => {
//     //   const roomKeys = await redis.keys("room:*");

//     //   for (const key of roomKeys) {
//     //     const roomId = key.split(":")[1];
//     //     const user = await removeUserFromRoom(roomId, socket.id);
//     //     if (user) {
//     //       io.to(roomId).emit("user_left", {
//     //         socketId: socket.id,
//     //         remote_user: user,
//     //       });
//     //     }
//     //   }
//     // });

//     // socket.on("user_leave", async ({ remote_user, roomId }) => {
//     //   await redis.srem(`room:${roomId}`, JSON.stringify(remote_user));
//     //   socket.to(roomId).emit("user_leave", { remote_user });
//     // });

//     // socket.on("offer", ({ roomId, offer }) => {
//     //   socket.to(roomId).emit("offer", offer);
//     // });

//     // socket.on("answer", ({ roomId, answer }) => {
//     //   socket.to(roomId).emit("answer", answer);
//     // });

//     // socket.on("ice-candidate", ({ roomId, candidate }) => {
//     //   socket.to(roomId).emit("ice-candidate", { candidate });
//     // });

//     // socket.on("recording-started", ({ roomId }) => {
//     //   socket.to(roomId).emit("recording-started", { roomId });
//     // });

//     // socket.on("recording-stop", ({ roomId }) => {
//     //   socket.to(roomId).emit("recording-stop", { roomId });
//     // });

//     // socket.on("recording-restart", ({ roomId }) => {
//     //   socket.to(roomId).emit("recording-restart", { roomId });
//     // });
//   });
// };

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

  const deleteMeetingData = async (meetingName: string): Promise<void> => {
    await redis.del(REDIS_KEYS.meetingStartTime(meetingName));
    await redis.del(REDIS_KEYS.meetingState(meetingName));
  };

  io.on("connection", (socket: Socket): void => {
    socket.on(
      "join-meeting",
      async ({ meetingName, userName, isHost, timestamp }) => {
        socket.join(meetingName);

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

    socket.on("recording-started", (data) => {
      socket.to(data.meetingName).emit("recording-started", data);
    });

    socket.on("recording-stopped", (data) => {
      socket.to(data.meetingName).emit("recording-stopped", data);
    });

    socket.on("participant-left-during-recording", (data) => {
      socket
        .to(data.meetingName)
        .emit("participant-left-during-recording", data);
    });

    socket.on("leave-meeting", async ({ meetingName, userName }) => {
      socket.leave(meetingName);

      const room = io.sockets.adapter.rooms.get(meetingName);
      if (!room || room.size === 0) {
        await deleteMeetingData(meetingName);
        console.log(`🗑️ Cleaned up data for empty meeting: ${meetingName}`);
      }
    });

    socket.on("disconnect", () => {
      console.log("User disconnected:", socket.id);
    });
  });
};
