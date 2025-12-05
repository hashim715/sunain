import { Request, Response, RequestHandler } from "express";
import { prisma } from "../config/postgres";
import jwt_decode from "jwt-decode";

export const startRecordingSession: RequestHandler = async (req, res) => {
  try {
    const { meetingName, participantCount } = req.body;

    const lastSession = await prisma.recordingSession.findFirst({
      where: { meetingName },
      orderBy: { recordingNumber: "desc" },
    });

    const nextRecordingNumber = lastSession
      ? lastSession.recordingNumber + 1
      : 1;

    await prisma.recordingSession.create({
      data: {
        meetingName,
        recordingNumber: nextRecordingNumber,
        recordingStartTime: new Date(),
        isRecording: true,
        participantCount,
        status: "active",
      },
    });

    return res.status(200).json({
      success: true,
      recordingNumber: nextRecordingNumber,
    });
  } catch (error) {
    return res.status(500).json({ message: "Failed to start recording" });
  } finally {
    await prisma.$disconnect();
  }
};

export const stopRecordingSession: RequestHandler = async (
  req: Request,
  res: Response
) => {
  try {
    const { meetingName } = req.body;

    const currentSession = await prisma.recordingSession.findFirst({
      where: {
        meetingName,
        isRecording: true,
        status: "active",
      },
      orderBy: { recordingNumber: "desc" },
    });

    if (!currentSession) {
      return res
        .status(404)
        .json({ message: "No active recording session found" });
    }

    await prisma.recordingSession.update({
      where: { id: currentSession.id },
      data: {
        isRecording: false,
        status: "incomplete",
        recordingEndTime: new Date(),
      },
    });

    return res.status(200).json({
      success: true,
      recordingNumber: currentSession.recordingNumber,
    });
  } catch (error) {
    console.error("Error stopping session:", error);
    return res.status(500).json({ message: "Failed to stop session" });
  } finally {
    await prisma.$disconnect();
  }
};

export const handleParticipantLeft: RequestHandler = async (
  req: Request,
  res: Response
) => {
  try {
    const { meetingName } = req.body;

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
      return res.status(404).json({ message: "No active recording session" });
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

    return res.status(200).json({
      success: true,
      message: "Recording marked for deletion",
      recordingNumber: currentSession.recordingNumber,
    });
  } catch (error) {
    console.error("Error handling participant left:", error);
    return res.status(500).json({ message: "Failed to process" });
  } finally {
    await prisma.$disconnect();
  }
};

export const createMeeting: RequestHandler = async (
  req: Request,
  res: Response
) => {
  const { sessionName, passcode } = req.body;
  try {
    if (!sessionName || !passcode) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    const token = req.cookies.authToken;

    const { username }: { username: string } = jwt_decode(token);

    const user = await prisma.user.findFirst({ where: { username: username } });

    const existingMeeting = await prisma.meeting.findFirst({
      where: { sessionName, userId: user.id },
    });

    if (existingMeeting) {
      return res
        .status(400)
        .json({ message: "Meeting with this session name already exists" });
    }

    const meeting = await prisma.meeting.create({
      data: {
        sessionName,
        passcode,
        userId: user.id,
        role: "host",
        isActive: true,
        joinedAt: new Date(),
      },
    });

    return res.status(201).json({ success: true, meeting });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Failed to create meeting" });
  } finally {
    await prisma.$disconnect();
  }
};

export const checkHostStatus: RequestHandler = async (
  req: Request,
  res: Response
) => {
  const { sessionName } = req.body;
  try {
    const token = req.cookies.authToken;

    const { username }: { username: string } = jwt_decode(token);

    const user = await prisma.user.findFirst({ where: { username: username } });

    const meeting = await prisma.meeting.findFirst({
      where: {
        sessionName,
        isActive: true,
        userId: user.id,
      },
    });

    if (!meeting) {
      return res.status(404).json({ message: "Meeting not found" });
    }

    const isHost = meeting.role === "host";

    return res.status(200).json({ isHost });
  } catch (err) {
    console.error("Error checking host status:", err);
    return res.status(500).json({ message: "Failed to check host status" });
  } finally {
    await prisma.$disconnect();
  }
};

export const joinMeeting: RequestHandler = async (
  req: Request,
  res: Response
) => {
  const { sessionName, passcode } = req.body;
  try {
    if (!sessionName || !passcode) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    const token = req.cookies.authToken;

    const { username }: { username: string } = jwt_decode(token);

    const user = await prisma.user.findFirst({ where: { username: username } });

    const existingMeeting = await prisma.meeting.findFirst({
      where: { sessionName: sessionName },
    });

    if (!existingMeeting) {
      return res.status(404).json({ message: "Meeting not found" });
    }

    if (existingMeeting.passcode !== passcode) {
      return res.status(401).json({
        success: false,
        message: "Invalid Passcode try again with valid passcode",
      });
    }

    const meeting = await prisma.meeting.findFirst({
      where: { sessionName: sessionName, userId: user.id },
    });

    if (meeting) {
      await prisma.meeting.update({
        where: { id: meeting.id, userId: user.id },
        data: { isActive: true },
      });
      return res
        .status(200)
        .json({ message: "Meeting with this session name already exists" });
    }

    await prisma.meeting.create({
      data: {
        sessionName: sessionName,
        passcode,
        userId: user.id,
        role: "participant",
        isActive: true,
        joinedAt: new Date(),
      },
    });

    return res
      .status(200)
      .json({ success: true, message: "Joined meeting successfully" });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Failed to join meeting" });
  } finally {
    await prisma.$disconnect();
  }
};

export const leaveMeeting: RequestHandler = async (
  req: Request,
  res: Response
) => {
  const { sessionName } = req.body;
  try {
    const token = req.cookies.authToken;

    const { username }: { username: string } = jwt_decode(token);

    const user = await prisma.user.findFirst({ where: { username: username } });

    const meeting = await prisma.meeting.findFirst({
      where: {
        sessionName,
        isActive: true,
        userId: user.id,
      },
    });

    if (!meeting) {
      return res.status(404).json({ message: "Meeting not found" });
    }

    await prisma.meeting.update({
      where: { id: meeting.id },
      data: { isActive: false },
    });

    return res
      .status(200)
      .json({ success: true, message: "Left meeting successfully" });
  } catch (err) {
    console.error("Error checking host status:", err);
    return res.status(500).json({ message: "Failed to check host status" });
  } finally {
    await prisma.$disconnect();
  }
};
