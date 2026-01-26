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
    console.log(error);
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
  const { sessionName, passcode, topicIds } = req.body;

  if (!topicIds || topicIds.length < 1) {
    return res.status(400).json({
      success: false,
      message: "Exactly 5 topics must be selected",
    });
  }

  try {
    if (!sessionName || !passcode) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    const token = req.cookies.authToken;

    const { username }: { username: string } = jwt_decode(token);

    const user = await prisma.user.findFirst({ where: { username: username } });

    const existingMeeting = await prisma.meeting.findUnique({
      where: { sessionName: sessionName },
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
        isActive: true,
        language: user.language,
        participantCount: 1,
      },
    });

    // Create the topic associations
    await prisma.meetingTopic.createMany({
      data: topicIds.map((topicId: number, index: number) => ({
        meetingId: meeting.id,
        topicId: topicId,
        order: index + 1,
      })),
    });

    await prisma.meetingParticipant.create({
      data: {
        meetingId: meeting.id,
        userId: user.id,
        role: "host",
        dialect: user.language_dialect,
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

    const meeting = await prisma.meeting.findUnique({
      where: {
        sessionName: sessionName,
      },
    });

    if (!meeting) {
      return res.status(404).json({ message: "Meeting not found" });
    }

    const meetingParticipant = await prisma.meetingParticipant.findFirst({
      where: { meetingId: meeting.id, userId: user.id },
    });

    if (!meetingParticipant) {
      return res.status(404).json({ message: "Meeting not found" });
    }

    const meetingData = await prisma.meeting.findFirst({
      where: {
        sessionName,
      },
      include: {
        topics: {
          include: {
            topic: {
              include: {
                subtopics: {
                  include: {
                    vocabulary: {
                      orderBy: { order: "asc" },
                    },
                    starters: {
                      orderBy: { order: "asc" },
                    },
                    examples: {
                      orderBy: { order: "asc" },
                    },
                  },
                  orderBy: { order: "asc" },
                },
              },
            },
          },
          orderBy: {
            order: "asc",
          },
        },
      },
    });

    if (!meetingData) {
      return res.status(404).json({
        success: false,
        message: "Meeting not found",
      });
    }

    const formattedTopics = meetingData.topics.map((mt) => ({
      title: mt.topic.title,
      subtopics: mt.topic.subtopics.map((subtopic) => ({
        title: subtopic.title,
        description: {
          overview: subtopic.overview,
          vocabulary: subtopic.vocabulary.map((v) => v.term),
          starters: subtopic.starters.map((s) => s.text),
          examples: subtopic.examples.map((e) => e.text),
        },
      })),
    }));

    const isHost = meetingParticipant.role === "host";

    return res.status(200).json({
      isHost,
      data: {
        ...meetingData,
        topics: formattedTopics,
      },
    });
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

    const existingMeeting = await prisma.meeting.findUnique({
      where: { sessionName: sessionName },
      include: { participants: true },
    });

    if (!existingMeeting) {
      return res.status(404).json({ message: "Meeting not found" });
    }

    if (existingMeeting.language !== user.language) {
      return res
        .status(404)
        .json({ message: "Meeting language is different from yours!" });
    }

    const now = new Date();
    const durationMs = now.getTime() - existingMeeting.createdAt.getTime();
    const durationMinutes = Math.floor(durationMs / (1000 * 60));

    if (durationMinutes >= 90) {
      return res.status(400).json({
        message: "Meeting exceeds max duration length create a new one!",
      });
    }

    if (existingMeeting.passcode !== passcode) {
      return res.status(401).json({
        success: false,
        message: "Invalid Passcode try again with valid passcode",
      });
    }

    const meetingParticipant = await prisma.meetingParticipant.findFirst({
      where: {
        meetingId: existingMeeting.id,
        userId: user.id,
      },
    });

    if (meetingParticipant && !meetingParticipant.leftAt) {
      return res.status(400).json({
        success: false,
        message: "You are already in this meeting",
      });
    }

    if (existingMeeting.participantCount >= 2) {
      return res.status(400).json({
        success: false,
        message: "Meeting is full!",
      });
    }

    if (meetingParticipant) {
      await prisma.meetingParticipant.update({
        where: {
          meetingId_userId: {
            meetingId: existingMeeting.id,
            userId: user.id,
          },
        },
        data: {
          joinedAt: new Date(),
          leftAt: null,
          dialect: user.language_dialect,
        },
      });
    } else {
      await prisma.meetingParticipant.create({
        data: {
          meetingId: existingMeeting.id,
          userId: user.id,
          role: "participant",
          joinedAt: new Date(),
          dialect: user.language_dialect,
        },
      });
    }

    await prisma.meeting.update({
      where: { sessionName: sessionName },
      data: { participantCount: existingMeeting.participantCount + 1 },
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

    const meeting = await prisma.meeting.findUnique({
      where: {
        sessionName: sessionName,
      },
    });

    if (!meeting) {
      return res.status(404).json({ message: "Meeting not found" });
    }

    await prisma.meetingParticipant.update({
      where: {
        meetingId_userId: {
          meetingId: meeting.id,
          userId: user.id,
        },
      },
      data: { leftAt: new Date() },
    });

    return res
      .status(200)
      .json({ success: true, message: "Left meeting successfully" });
  } catch (err) {
    console.error("Error leaving meeting:", err);
    return res.status(500).json({ message: "Failed to leave meeting" });
  } finally {
    await prisma.$disconnect();
  }
};
