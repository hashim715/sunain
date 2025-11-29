import { Request, Response, RequestHandler } from "express";
import { prisma } from "../config/postgres";

export const startRecording: RequestHandler = async (req, res) => {
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

    res.status(200).json({
      success: true,
      recordingNumber: nextRecordingNumber,
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to start recording" });
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
        .json({ error: "No active recording session found" });
    }

    await prisma.recordingSession.update({
      where: { id: currentSession.id },
      data: {
        isRecording: false,
        status: "completed",
      },
    });

    return res.status(200).json({
      success: true,
      recordingNumber: currentSession.recordingNumber,
    });
  } catch (error) {
    console.error("Error stopping session:", error);
    return res.status(500).json({ error: "Failed to stop session" });
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
      return res.status(404).json({ error: "No active recording session" });
    }

    await prisma.recordingSession.update({
      where: { id: currentSession.id },
      data: {
        isRecording: false,
        status: "interrupted",
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
    return res.status(500).json({ error: "Failed to process" });
  }
};
