import { Application } from "express";
import http from "http";
import { Server, Socket } from "socket.io";
import Redis from "ioredis";
import { createAdapter } from "@socket.io/redis-adapter";

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

  const getRoomUsers = async (roomId: string) => {
    const members = await redis.smembers(`room:${roomId}`);
    return members.map((m) => JSON.parse(m));
  };

  const removeUserFromRoom = async (roomId: string, socketId: string) => {
    const users = await getRoomUsers(roomId);
    const userToRemove = users.find((u) => u.socketId === socketId);
    if (userToRemove) {
      await redis.srem(`room:${roomId}`, JSON.stringify(userToRemove));
      return userToRemove;
    }
    return null;
  };

  // Store meeting start times in memory (or database for persistence)
  const meetingStartTimes = new Map();
  // Store meeting states (topic/subtopic info)
  const meetingStates = new Map();

  io.on("connection", (socket: Socket): void => {
    // socket.on("join-room", async ({ roomId, user }) => {
    //   socket.join(roomId);

    //   const existingUsers = await getRoomUsers(roomId);
    //   const alreadyInRoom = existingUsers.some((u) => u.id === user.id);
    //   if (!alreadyInRoom) {
    //     await redis.sadd(
    //       `room:${roomId}`,
    //       JSON.stringify({ ...user, socketId: socket.id })
    //     );
    //   }

    //   socket.to(roomId).emit("user_joined", { remote_user: user });

    //   const updatedUsers = await getRoomUsers(roomId);
    //   socket.emit("existing-users", {
    //     users: updatedUsers.filter((u) => u.id !== user.id),
    //   });
    // });

    // socket.on("disconnect", async () => {
    //   const roomKeys = await redis.keys("room:*");

    //   for (const key of roomKeys) {
    //     const roomId = key.split(":")[1];
    //     const user = await removeUserFromRoom(roomId, socket.id);
    //     if (user) {
    //       io.to(roomId).emit("user_left", {
    //         socketId: socket.id,
    //         remote_user: user,
    //       });
    //     }
    //   }
    // });

    // socket.on("user_leave", async ({ remote_user, roomId }) => {
    //   await redis.srem(`room:${roomId}`, JSON.stringify(remote_user));
    //   socket.to(roomId).emit("user_leave", { remote_user });
    // });

    // socket.on("offer", ({ roomId, offer }) => {
    //   socket.to(roomId).emit("offer", offer);
    // });

    // socket.on("answer", ({ roomId, answer }) => {
    //   socket.to(roomId).emit("answer", answer);
    // });

    // socket.on("ice-candidate", ({ roomId, candidate }) => {
    //   socket.to(roomId).emit("ice-candidate", { candidate });
    // });

    // socket.on("recording-started", ({ roomId }) => {
    //   socket.to(roomId).emit("recording-started", { roomId });
    // });

    // socket.on("recording-stop", ({ roomId }) => {
    //   socket.to(roomId).emit("recording-stop", { roomId });
    // });

    // socket.on("recording-restart", ({ roomId }) => {
    //   socket.to(roomId).emit("recording-restart", { roomId });
    // });

    socket.on(
      "join-meeting",
      ({ meetingName, userName, isHost, timestamp }) => {
        socket.join(meetingName);

        if (isHost && !meetingStartTimes.has(meetingName)) {
          meetingStartTimes.set(meetingName, timestamp);
          meetingStates.set(meetingName, {
            topicIndex: 0,
            subtopicIndex: null,
            completedTopics: [],
          });
        }

        const startTime = meetingStartTimes.get(meetingName);
        if (startTime) {
          socket.emit("meeting-time-sync", { startTime });
        }
      }
    );

    socket.on("request-topic-state", ({ meetingName }) => {
      const state = meetingStates.get(meetingName);
      if (state) {
        socket.emit("current-topic-state", state);
      }
    });

    socket.on("request-meeting-time", ({ meetingName }) => {
      const startTime = meetingStartTimes.get(meetingName);
      if (startTime) {
        socket.emit("meeting-time-sync", { startTime });
      }
    });

    socket.on(
      "select-subtopic",
      ({ meetingName, topicIndex, subtopicIndex, selectedBy }) => {
        const state = meetingStates.get(meetingName) || {
          topicIndex: 0,
          subtopicIndex: null,
          completedTopics: [],
        };

        state.topicIndex = topicIndex;
        state.subtopicIndex = subtopicIndex;
        meetingStates.set(meetingName, state);

        io.to(meetingName).emit("subtopic-selected", {
          topicIndex,
          subtopicIndex,
          selectedBy,
        });
      }
    );

    socket.on(
      "change-topic",
      ({
        meetingName,
        topicIndex,
        subtopicIndex,
        completedTopics,
        changedBy,
      }) => {
        const state = meetingStates.get(meetingName) || {
          topicIndex: 0,
          subtopicIndex: null,
          completedTopics: [],
        };

        state.topicIndex = topicIndex;
        state.subtopicIndex = subtopicIndex;
        state.completedTopics = completedTopics;
        meetingStates.set(meetingName, state);

        io.to(meetingName).emit("topic-changed", {
          topicIndex,
          subtopicIndex,
          completedTopics,
          changedBy,
        });
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

    socket.on("leave-meeting", ({ meetingName, userName }) => {
      socket.leave(meetingName);
    });

    socket.on("disconnect", () => {
      // console.log("User disconnected:", socket.id);
    });
  });
};
