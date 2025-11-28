import { Request, Response, RequestHandler } from "express";
import { prisma } from "../config/postgres";

export const startRecordingSession: RequestHandler = async (
  req: Request,
  res: Response
) => {
  try {
    const { meetingName, participantCount } = req.body;

    const recordingNumber = await getNextRecordingNumber(meetingName);

    await prisma.recordingSession.upsert({
      where: { meetingName },
      update: {
        isRecording: true,
        recordingNumber,
        participantCount,
        status: "active",
        startedAt: new Date(),
      },
      create: {
        meetingName,
        recordingNumber,
        isRecording: true,
        participantCount,
        status: "active",
      },
    });

    console.log(`✅ Recording session started: recording-${recordingNumber}`);

    return res.status(200).json({
      success: true,
      recordingNumber,
    });
  } catch (error) {
    console.error("Error starting recording session:", error);
    return res.status(500).json({ error: "Failed to start session" });
  }
};

export const stopRecordingSession: RequestHandler = async (
  req: Request,
  res: Response
) => {
  try {
    const { meetingName } = req.body;

    await prisma.recordingSession.update({
      where: { meetingName },
      data: {
        isRecording: false,
        status: "completed",
      },
    });

    return res.status(200).json({ success: true });
  } catch (error) {
    return res.status(500).json({ error: "Failed to stop session" });
  }
};

export const handleParticipantLeft: RequestHandler = async (
  req: Request,
  res: Response
) => {
  try {
    const { meetingName, leftUserName } = req.body;

    const session = await prisma.recordingSession.findUnique({
      where: { meetingName },
    });

    if (!session) {
      console.log(`⚠️ No active session found for: ${meetingName}`);
      return res.status(404).json({ error: "Session not found" });
    }

    if (!session.isRecording) {
      console.log(`⚠️ Session not recording: ${meetingName}`);
      return res.status(200).json({ message: "Not recording" });
    }

    await prisma.recordingSession.update({
      where: { meetingName },
      data: {
        isRecording: false,
        status: "interrupted",
      },
    });

    return res.status(200).json({
      success: true,
      message: "Recording marked for deletion",
      recordingNumber: session.recordingNumber,
    });
  } catch (error) {
    console.error("Error handling participant left:", error);
    return res.status(500).json({ error: "Failed to process" });
  }
};

const getNextRecordingNumber = async (meetingName: string): Promise<number> => {
  const latestRecording = await prisma.recordingSession.findFirst({
    where: { meetingName },
    orderBy: { recordingNumber: "desc" },
  });

  return latestRecording ? latestRecording.recordingNumber + 1 : 1;
};
