import dotenv from "dotenv";
import { Server, Socket } from "socket.io";
import http from "http";
import { Application } from "express";
import { createAdapter } from "@socket.io/redis-streams-adapter";
import { Request, Response, NextFunction, RequestHandler } from "express";
import jwt_decode from "jwt-decode";

dotenv.config();

export let io: Server | null = null;

export const chatController = async (
  app: Application,
  server: http.Server
): Promise<void> => {
  io = new Server(server, {
    cors: { origin: "*", methods: ["GET", "POST"] },
  });

  io.on("connection", async (socket: Socket): Promise<void> => {
    socket.on("join-room", (roomId) => {
      const room = io.sockets.adapter.rooms.get(roomId);
      const numClients = room ? room.size : 0;

      socket.join(roomId);

      if (numClients === 0) {
      } else if (numClients === 1) {
        socket.to(roomId).emit("ready");
      }
    });

    socket.on("offer", ({ roomId, offer }) => {
      console.log(offer);
      socket.to(roomId).emit("offer", offer);
    });

    socket.on("answer", ({ roomId, answer }) => {
      console.log(answer);
      socket.to(roomId).emit("answer", answer);
    });

    socket.on("ice-candidate", ({ roomId, candidate }) => {
      console.log(candidate);
      socket.to(roomId).emit("ice-candidate", { candidate });
    });

    socket.on("recording-started", ({ roomId }) => {
      socket.to(roomId).emit("recording-started", { roomId });
    });

    socket.on("recording-stop", ({ roomId }) => {
      socket.to(roomId).emit("recording-stop", { roomId });
    });
  });
};
