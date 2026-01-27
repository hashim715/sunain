import { prisma } from "../config/postgres";
import { Request, Response, RequestHandler } from "express";
import { internalServerError } from "./errors";
import dotenv from "dotenv";
import { logger } from "../utils/logger";
import bcrypt from "bcrypt";
import { sendTokenCookie } from "../utils/sendTokenCookie";
import { email_transporter } from "../utils/sendEmail";
import { validateEmail } from "../utils/checkvalidEmail";
import {
  S3Client,
  ListObjectsV2Command,
  GetObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { s3 } from "../config/aws_s3";
import { exec } from "child_process";
import { promisify } from "util";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const execAsync = promisify(exec);

dotenv.config();

const BUCKET_NAME = process.env.S3_BUCKET_NAME;

export const login: RequestHandler = async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res
        .status(400)
        .json({ success: false, message: "Please provide valid inputs" });
    }

    let user = await prisma.user.findFirst({
      where: { email: email },
    });

    if (!user || user.user_type !== "admin") {
      return res.status(400).json({
        success: false,
        message: "User is not authorized",
      });
    }

    const isValid = await bcrypt.compare(password, user.password);

    if (!isValid) {
      return res.status(400).json({
        success: false,
        message: "Invalid password",
      });
    }

    if (!user.email_verified) {
      return res.status(400).json({
        success: false,
        message: "your email is not verified",
      });
    }

    await sendTokenCookie(res, user.username);

    return res.status(200).json({
      success: true,
      message: "Logged in successfully",
    });
  } catch (err) {
    logger.error(`Error in login: ${err}`);
    if (!res.headersSent) {
      return internalServerError(res);
    }
  } finally {
    await prisma.$disconnect();
  }
};

export const getUsersWaitList: RequestHandler = async (
  req: Request,
  res: Response
) => {
  try {
    const waitlist = await prisma.user.findMany({
      where: {
        adminVerify: "waiting",
        details_added: true,
        verified: true,
        email_verified: true,
        language: "Arabic", // ONLY ARABIC USERS
      },
      select: {
        id: true,
        name: true,
        email: true,
        phone_number: true,
        date_of_birth: true,
        country: true,
        language: true,
        language_dialect: true,
      },
      orderBy: {
        createdAt: "asc",
      },
    });

    const formattedWaitlist = waitlist.map((user) => ({
      id: user.id,
      full_name: user.name || "N/A",
      email: user.email,
      phone: user.phone_number || "N/A",
      age: user.date_of_birth ? calculateAge(user.date_of_birth) : null,
      country: user.country || "N/A",
      language: user.language || "N/A",
      dialect: user.language_dialect || "N/A",
    }));

    return res.status(200).json(formattedWaitlist);
  } catch (err) {
    logger.error(`Error in getting meeting metadata: ${err}`);
    if (!res.headersSent) {
      return internalServerError(res);
    }
  } finally {
    await prisma.$disconnect();
  }
};

export const updateUserStatus: RequestHandler = async (
  req: Request,
  res: Response
) => {
  try {
    const { user_id, status } = req.body;

    if (!user_id || !status) {
      return res
        .status(400)
        .json({ success: false, message: "invalid user id or invalid status" });
    }

    const user = await prisma.user.findFirst({
      where: { id: parseInt(user_id) },
    });

    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "user not found" });
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { adminVerify: status === "approved" ? "active" : "suspended" },
    });

    return res.status(200).json({
      success: true,
      message:
        status === "approved"
          ? "user approved successfully"
          : "user is disapproved",
    });
  } catch (err) {
    logger.error(`Error in getting meeting metadata: ${err}`);
    if (!res.headersSent) {
      return internalServerError(res);
    }
  } finally {
    await prisma.$disconnect();
  }
};

export const flaggedConversations: RequestHandler = async (
  req: Request,
  res: Response
) => {
  try {
    const conversations = await prisma.conversation.findMany({
      where: {
        flagged_status: true,
        status: {
          in: ["incomplete", "completed"],
        },
        meeting: {
          language: "Arabic",
        },
        user: {
          language: "Arabic",
        },
      },
      include: {
        meeting: {
          select: {
            id: true,
            sessionName: true,
            language: true,
          },
        },
        user: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    const formattedConversations = await Promise.all(
      conversations.map(async (conv) => {
        const participants = await prisma.meetingParticipant.findMany({
          where: {
            meetingId: conv.meetingId,
            userId: { not: conv.userId },
          },
          include: {
            user: {
              select: {
                id: true,
                name: true,
              },
            },
          },
          take: 1,
        });

        const otherParticipant = participants[0];
        const durationSeconds = parseFloat(conv.duration.toString());
        const minutes = Math.floor(durationSeconds / 60);
        const seconds = Math.floor(durationSeconds % 60);

        return {
          conversation_id: `${conv.id}`,
          participant_1_id: `user_${conv.userId}`,
          participant_2_id: otherParticipant
            ? `user_${otherParticipant.user.id}`
            : "N/A",
          language: conv.meeting.language,
          duration_seconds: durationSeconds,
          duration_formatted: `${minutes} min ${seconds} sec`,
          flagging_reasons: conv.flagged_reasons,
          status: conv.flagged_status ? "flagged" : "unflagged",
        };
      })
    );

    return res.status(200).json(formattedConversations);
  } catch (err) {
    logger.error(`Error in getting meeting metadata: ${err}`);
    if (!res.headersSent) {
      return internalServerError(res);
    }
  } finally {
    await prisma.$disconnect();
  }
};

export const updateConversationFlaggedStatus: RequestHandler = async (
  req: Request,
  res: Response
) => {
  try {
    const { conversation_id, status } = req.body;

    if (!conversation_id || !status) {
      return res.status(400).json({
        success: false,
        message: "invalid conversation id or invalid status",
      });
    }

    const conversation = await prisma.conversation.findFirst({
      where: {
        id: parseInt(conversation_id),
        meeting: {
          language: "Arabic", // ONLY ARABIC CONVERSATIONS
        },
        user: {
          language: "Arabic", // ONLY ARABIC USERS
        },
      },
    });

    if (!conversation) {
      return res.status(404).json({
        success: false,
        message: "conversation not found or not an Arabic conversation",
      });
    }

    await prisma.conversation.update({
      where: { id: conversation.id },
      data: { flagged_status: status === "unflagged" ? false : true },
    });

    return res.status(200).json({
      success: true,
      message:
        status === "unflagged"
          ? "conversation unflagged successfully"
          : "conversation is flagged",
    });
  } catch (err) {
    logger.error(`Error in getting meeting metadata: ${err}`);
    if (!res.headersSent) {
      return internalServerError(res);
    }
  } finally {
    await prisma.$disconnect();
  }
};

export const flaggedConversationsCount: RequestHandler = async (
  req: Request,
  res: Response
) => {
  try {
    const { userId } = req.params;

    if (!userId) {
      return res.status(400).json({ error: "User ID is required" });
    }

    const userIdInt = parseInt(userId);

    const user = await prisma.user.findFirst({
      where: {
        id: userIdInt,
        language: "Arabic",
      },
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "user not found or not an Arabic user",
      });
    }

    const countAsMainUser = await prisma.conversation.count({
      where: {
        userId: user.id,
        flagged_status: true,
        status: {
          in: ["incomplete", "completed"],
        },
        meeting: {
          language: "Arabic",
        },
      },
    });

    const totalCount = countAsMainUser;

    return res.status(200).json({
      count: totalCount,
      userId: userIdInt,
    });
  } catch (err) {
    logger.error(`Error in getting flagged conversations count: ${err}`);
    if (!res.headersSent) {
      return internalServerError(res);
    }
  } finally {
    await prisma.$disconnect();
  }
};

export const getAllRoomsForUser: RequestHandler = async (
  req: Request,
  res: Response
) => {
  try {
    const { userId } = req.params;

    if (!userId) {
      return res.status(400).json({ error: "User ID is required" });
    }

    const userIdInt = parseInt(userId);

    const user = await prisma.user.findFirst({
      where: {
        id: userIdInt,
        language: "Arabic",
      },
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "user not found or not an Arabic user",
      });
    }

    const participations = await prisma.meetingParticipant.findMany({
      where: {
        userId: user.id,
        meeting: {
          language: "Arabic",
        },
      },
      include: {
        meeting: {
          select: {
            sessionName: true,
            id: true,
          },
        },
      },
      orderBy: {
        joinedAt: "asc",
      },
    });

    const roomIds = participations.map((p) => `Room-${p.meeting.id}`);

    return res.status(200).json({
      user_id: userId,
      room_ids: roomIds,
      all_room_ids: roomIds.join(", "),
    });
  } catch (err) {
    logger.error(`Error getting all rooms for user: ${err}`);
    if (!res.headersSent) {
      return internalServerError(res);
    }
  } finally {
    await prisma.$disconnect();
  }
};

export const getPaymentRoomsForUser: RequestHandler = async (
  req: Request,
  res: Response
) => {
  try {
    const { userId } = req.params;

    if (!userId) {
      return res.status(400).json({ error: "User ID is required" });
    }

    const userIdInt = parseInt(userId);

    const user = await prisma.user.findFirst({
      where: {
        id: userIdInt,
        language: "Arabic",
      },
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "user not found or not an Arabic user",
      });
    }

    const unpaidConversations = await prisma.conversation.findMany({
      where: {
        userId: user.id,
        paymentStatus: "unpaid",
        flagged_status: false,
        status: "completed",
        meeting: {
          language: "Arabic",
        },
      },
      include: {
        meeting: {
          select: {
            sessionName: true,
            id: true,
          },
        },
      },
      distinct: ["meetingId"],
    });

    const roomIds = unpaidConversations.map((c) => `Room-${c.meeting.id}`);

    return res.status(200).json({
      user_id: userId,
      room_ids: roomIds,
      payment_due_rooms: roomIds.join(", "),
    });
  } catch (err) {
    logger.error(`Error getting payment rooms for user: ${err}`);
    if (!res.headersSent) {
      return internalServerError(res);
    }
  } finally {
    await prisma.$disconnect();
  }
};

export const getRoomDetails: RequestHandler = async (
  req: Request,
  res: Response
) => {
  try {
    const { roomId } = req.params;

    if (!roomId) {
      return res.status(400).json({ error: "Room ID is required" });
    }

    const meeting = await prisma.meeting.findUnique({
      where: {
        id: parseInt(roomId.split("-")[1]),
        language: "Arabic",
      },
      include: {
        participants: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
        conversations: {
          where: {
            status: "completed",
            flagged_status: false,
          },
          orderBy: {
            createdAt: "asc",
          },
          select: {
            id: true,
            duration: true,
            userId: true,
            createdAt: true,
          },
        },
      },
    });

    if (!meeting) {
      return res
        .status(404)
        .json({ error: "Room not found or not an Arabic meeting" });
    }

    const participants = meeting.participants.map((p) => ({
      id: p.userId,
      name: p.user.name,
    }));

    const conversationsFormatted = meeting.conversations.map((conv, index) => {
      const durationSeconds = parseFloat(conv.duration.toString());
      const minutes = Math.floor(durationSeconds / 60);
      const seconds = Math.floor(durationSeconds % 60);

      return {
        [`conversation_${index + 1}_id`]: `${conv.id}`,
        [`conv_${index + 1}_duration_seconds`]: durationSeconds,
        [`conv_${
          index + 1
        }_duration_formatted`]: `${minutes} min ${seconds} sec`,
      };
    });

    const conversationsFlat = conversationsFormatted.reduce((acc, conv) => {
      return { ...acc, ...conv };
    }, {});

    const roomDetails = {
      room_id: `Room-${meeting.id}`,
      participant_1_id: participants[0] ? `user_${participants[0].id}` : null,
      participant_2_id: participants[1] ? `user_${participants[1].id}` : null,
      language: meeting.language,
      ...conversationsFlat,
      created_date: meeting.createdAt.toISOString().split("T")[0],
    };

    return res.status(200).json(roomDetails);
  } catch (err) {
    logger.error(`Error getting room details: ${err}`);
    if (!res.headersSent) {
      return internalServerError(res);
    }
  } finally {
    await prisma.$disconnect();
  }
};

export const getAllUsers: RequestHandler = async (
  req: Request,
  res: Response
) => {
  try {
    const users = await prisma.user.findMany({
      include: {
        conversations: {
          select: {
            duration: true,
            quality: true,
            earnings: true,
            paymentStatus: true,
            status: true,
          },
          where: {
            status: "completed",
            flagged_status: false,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
      where: {
        user_type: "user",
        language: "Arabic",
      },
    });

    const formattedUsers = users.map((user) => {
      const totalRecordingMinutes =
        user.conversations.reduce((sum, conv) => {
          return sum + Number(conv.duration);
        }, 0) / 60;

      const numConversations = user.conversations.length;

      const totalMoneyEarned = user.conversations.reduce((sum, conv) => {
        return sum + parseFloat(conv.earnings.toString());
      }, 0);

      const totalBalance = user.conversations
        .filter((conv) => conv.paymentStatus === "unpaid")
        .reduce((sum, conv) => {
          return sum + parseFloat(conv.earnings.toString());
        }, 0);

      const amountPaid = user.conversations
        .filter((conv) => conv.paymentStatus === "paid")
        .reduce((sum, conv) => {
          return sum + parseFloat(conv.earnings.toString());
        }, 0);

      const averageQualityScore =
        numConversations > 0
          ? user.conversations.reduce((sum, conv) => {
              return sum + parseFloat(conv.quality.toString());
            }, 0) / numConversations
          : 0;

      const age = user.date_of_birth ? calculateAge(user.date_of_birth) : null;

      const status = user.adminVerify;

      return {
        user_id: `${user.id}`,
        email: user.email,
        full_name: user.name || "N/A",
        age: age,
        language: user.language || "N/A",
        dialect: user.language_dialect || "N/A",
        total_recording_minutes: parseFloat(totalRecordingMinutes.toFixed(2)),
        num_conversations: numConversations,
        total_money_earned: parseFloat(totalMoneyEarned.toFixed(2)),
        total_balance: parseFloat(totalBalance.toFixed(2)),
        amount_paid: parseFloat(amountPaid.toFixed(2)),
        average_quality_score: parseFloat(averageQualityScore.toFixed(2)),
        status: status,
        stripe_account_id: user.stripeAccountId || "N/A",
        stripeOnboardingComplete: user.stripeOnboardingComplete,
        stripeDetailsSubmitted: user.stripeDetailsSubmitted,
        stripeChargesEnabled: user.stripeChargesEnabled,
        stripePayoutsEnabled: user.stripePayoutsEnabled,
        paypalEmail: user.paypalEmail || "N/A",
        wiseEmail: user.wiseEmail || "N/A",
        revolutEmail: user.revolutEmail || "N/A",
      };
    });

    return res.status(200).json(formattedUsers);
  } catch (err) {
    logger.error(`Error getting all users: ${err}`);
    if (!res.headersSent) {
      return internalServerError(res);
    }
  } finally {
    await prisma.$disconnect();
  }
};

export const getLanguageStats: RequestHandler = async (
  req: Request,
  res: Response
) => {
  try {
    const { language } = req.params;

    if (!language) {
      return res.status(400).json({ error: "Language is required" });
    }

    const stats = await prisma.conversation.aggregate({
      where: {
        meeting: {
          language: language,
        },
        status: "completed",
        flagged_status: false,
      },
      _sum: {
        duration: true,
      },
      _count: {
        id: true,
      },
    });

    if (!stats._count.id || stats._count.id === 0) {
      return res.status(404).json({ error: "No data found for this language" });
    }

    const totalDurationSeconds = stats._sum.duration
      ? parseFloat(stats._sum.duration.toString())
      : 0;

    const totalHours = parseFloat((totalDurationSeconds / 3600).toFixed(2));

    const result = {
      language: language,
      total_hours: totalHours,
      total_conversations: stats._count.id,
    };

    return res.status(200).json(result);
  } catch (err) {
    logger.error(`Error getting language stats: ${err}`);
    if (!res.headersSent) {
      return internalServerError(res);
    }
  } finally {
    await prisma.$disconnect();
  }
};

export const getAllLanguageStats: RequestHandler = async (
  req: Request,
  res: Response
) => {
  try {
    const conversations = await prisma.conversation.findMany({
      where: {
        status: "completed",
        flagged_status: false,
        meeting: {
          language: "Arabic",
        },
      },
      select: {
        meetingId: true,
        duration: true,
        recording: {
          select: {
            recordingNumber: true,
          },
        },
        meeting: {
          select: {
            language: true,
          },
        },
      },
    });

    const recordingGroups = new Map<
      string,
      {
        language: string;
        duration: number;
        count: number;
      }
    >();

    conversations.forEach((conv) => {
      if (conv.recording) {
        const key = `${conv.meetingId}-${conv.recording.recordingNumber}`;

        if (!recordingGroups.has(key)) {
          recordingGroups.set(key, {
            language: conv.meeting.language,
            duration: parseFloat(conv.duration.toString()),
            count: 1,
          });
        } else {
          recordingGroups.get(key)!.count++;
        }
      }
    });

    const languageMap = new Map<
      string,
      { totalHours: number; count: number }
    >();

    Array.from(recordingGroups.values())
      .filter((data) => data.count > 1)
      .forEach(({ language, duration }) => {
        if (!languageMap.has(language)) {
          languageMap.set(language, { totalHours: 0, count: 0 });
        }
        const stats = languageMap.get(language)!;
        stats.totalHours += duration / 3600;
        stats.count++;
      });

    const languageStats = Array.from(languageMap.entries()).map(
      ([language, stats]) => ({
        language,
        total_hours: parseFloat(stats.totalHours.toFixed(2)),
        total_recordings: stats.count,
      })
    );

    languageStats.sort((a, b) => b.total_hours - a.total_hours);

    return res.status(200).json(languageStats);
  } catch (err) {
    logger.error(`Error getting all language stats: ${err}`);
    if (!res.headersSent) {
      return internalServerError(res);
    }
  } finally {
    await prisma.$disconnect();
  }
};

export const getDialectDistribution: RequestHandler = async (
  req: Request,
  res: Response
) => {
  try {
    const { language } = req.params;

    const participants = await prisma.meetingParticipant.findMany({
      where: {
        meeting: {
          language: language,
        },
        dialect: {
          not: null,
        },
      },
      select: {
        dialect: true,
      },
    });

    if (participants.length === 0) {
      return res.status(404).json({ error: "No dialect data found" });
    }

    const dialectCounts = participants.reduce((acc, p) => {
      const dialect = p.dialect!;
      acc[dialect] = (acc[dialect] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const totalInstances = participants.length;

    const formattedStats = Object.entries(dialectCounts)
      .map(([dialect, instances]) => ({
        language: language,
        dialect: dialect,
        instances: instances,
        percentage: parseFloat(((instances / totalInstances) * 100).toFixed(2)),
      }))
      .sort((a, b) => b.instances - a.instances);

    return res.status(200).json(formattedStats);
  } catch (err) {
    logger.error(`Error getting dialect distribution: ${err}`);
    if (!res.headersSent) {
      return internalServerError(res);
    }
  } finally {
    await prisma.$disconnect();
  }
};

export const getDialectPairs: RequestHandler = async (
  req: Request,
  res: Response
) => {
  try {
    const { language } = req.params;

    if (!language) {
      return res.status(400).json({ error: "Language is required" });
    }

    const conversations = await prisma.conversation.findMany({
      where: {
        meeting: {
          language: language,
        },
        status: "completed",
        flagged_status: false,
      },
      include: {
        meeting: {
          include: {
            participants: {
              where: {
                dialect: {
                  not: null,
                },
              },
              select: {
                dialect: true,
                userId: true,
              },
            },
          },
        },
      },
    });

    if (conversations.length === 0) {
      return res
        .status(404)
        .json({ error: "No dialect pair data found for this language" });
    }

    const dialectPairCounts: Record<string, number> = {};

    conversations.forEach((conv) => {
      const participants = conv.meeting.participants;

      if (participants.length >= 2) {
        const uniqueParticipants = Array.from(
          new Map(participants.map((p) => [p.userId, p])).values()
        );

        if (uniqueParticipants.length >= 2) {
          const dialect1 = uniqueParticipants[0].dialect!;
          const dialect2 = uniqueParticipants[1].dialect!;

          let dialectPair: string;

          if (dialect1 === dialect2) {
            dialectPair = `${dialect1} (both speakers)`;
          } else {
            const [first, second] = [dialect1, dialect2].sort();
            dialectPair = `${first} + ${second}`;
          }
          dialectPairCounts[dialectPair] =
            (dialectPairCounts[dialectPair] || 0) + 1;
        }
      }
    });

    const formattedPairs = Object.entries(dialectPairCounts)
      .map(([dialectPair, count]) => ({
        language: language,
        dialect_pair: dialectPair,
        conversation_count: count,
      }))
      .sort((a, b) => b.conversation_count - a.conversation_count);

    return res.status(200).json(formattedPairs);
  } catch (err) {
    logger.error(`Error getting dialect pairs: ${err}`);
    if (!res.headersSent) {
      return internalServerError(res);
    }
  } finally {
    await prisma.$disconnect();
  }
};

export const markRoomsAsPaid: RequestHandler = async (req, res) => {
  try {
    const { items } = req.body as {
      items: { userId: number | string; roomIds: (number | string)[] }[];
    };

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: "items is required" });
    }

    const now = new Date();

    const ops = items.map((it) => {
      const userId = Number(it.userId);
      const roomIds = (it.roomIds || [])
        .map(Number)
        .filter((n) => Number.isFinite(n));

      if (!Number.isFinite(userId) || roomIds.length === 0) {
        return prisma.conversation.updateMany({ where: { id: -1 }, data: {} });
      }

      return prisma.conversation.updateMany({
        where: {
          userId,
          meetingId: { in: roomIds },
          meeting: { language: "Arabic" },
          user: {
            language: "Arabic",
            OR: [
              {
                AND: [
                  { stripeAccountId: { not: null } },
                  { stripeChargesEnabled: true },
                  { stripeDetailsSubmitted: true },
                  { stripeOnboardingComplete: true },
                  { stripePayoutsEnabled: true },
                ],
              },
              {
                AND: [
                  { paypalEmail: { not: null } },
                  { paypalEmail: { not: "N/A" } },
                  { paypalEmail: { not: "" } },
                ],
              },
              {
                AND: [
                  { wiseEmail: { not: null } },
                  { wiseEmail: { not: "N/A" } },
                  { wiseEmail: { not: "" } },
                ],
              },
              {
                AND: [
                  { revolutEmail: { not: null } },
                  { revolutEmail: { not: "N/A" } },
                  { revolutEmail: { not: "" } },
                ],
              },
              {
                AND: [
                  { instaPayEnabled: true },
                  { instaPayPhone: { not: null } },
                  { instaPayPhone: { not: "N/A" } },
                  { instaPayPhone: { not: "" } },
                ],
              },
            ],
          },
          flagged_status: false,
          paymentStatus: "unpaid",
        },
        data: {
          paymentStatus: "paid",
          paidAt: now,
        },
      });
    });

    const results = await prisma.$transaction(ops);
    const updated_count = results.reduce((sum, r) => sum + r.count, 0);

    return res.status(200).json({
      success: true,
      message: `Marked ${updated_count} conversations as paid (room-scoped)`,
      updated_count,
    });
  } catch (err) {
    logger.error(`Error marking rooms as paid: ${err}`);
    if (!res.headersSent) return internalServerError(res);
  }
};

export const undoPayroll: RequestHandler = async (req, res) => {
  try {
    const { items } = req.body as {
      items: { userId: number | string; roomIds: (number | string)[] }[];
    };

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: "items is required" });
    }

    const ops = items.map((it) => {
      const userId = Number(it.userId);
      const roomIds = (it.roomIds || []).map(Number).filter(Number.isFinite);

      if (!Number.isFinite(userId) || roomIds.length === 0) {
        return prisma.conversation.updateMany({ where: { id: -1 }, data: {} });
      }

      return prisma.conversation.updateMany({
        where: {
          userId,
          meetingId: { in: roomIds },
          user: { language: "Arabic" },
          meeting: { language: "Arabic" },
          paymentStatus: "paid",
        },
        data: {
          paymentStatus: "unpaid",
          paidAt: null,
        },
      });
    });

    const results = await prisma.$transaction(ops);
    const updated_count = results.reduce((sum, r) => sum + r.count, 0);

    return res.status(200).json({
      success: true,
      message: `Reverted ${updated_count} conversations back to unpaid (room-scoped)`,
      updated_count,
    });
  } catch (err) {
    logger.error(`Error undoing payroll: ${err}`);
    if (!res.headersSent) return internalServerError(res);
  }
};

const hasPaymentMethod = (user: any): boolean => {
  const hasStripe =
    user.stripeAccountId &&
    user.stripeAccountId !== "N/A" &&
    user.stripeAccountId !== "" &&
    user.stripeChargesEnabled === true &&
    user.stripeDetailsSubmitted === true &&
    user.stripeOnboardingComplete === true &&
    user.stripePayoutsEnabled === true;

  const hasPayPal =
    user.paypalEmail && user.paypalEmail !== "N/A" && user.paypalEmail !== "";

  const hasWise =
    user.wiseEmail && user.wiseEmail !== "N/A" && user.wiseEmail !== "";

  const hasRevolut =
    user.revolutEmail &&
    user.revolutEmail !== "N/A" &&
    user.revolutEmail !== "";

  return hasStripe || hasPayPal || hasWise || hasRevolut;
};

const generatePaymentReminderEmail = (
  userName: string,
  unpaidBalance: number
) => {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body {
          font-family: Arial, sans-serif;
          line-height: 1.6;
          color: #333;
        }
        .container {
          max-width: 600px;
          margin: 0 auto;
          padding: 20px;
        }
        .content {
          background-color: white;
          padding: 30px;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="content">
          <p>Hi,</p>
          
          <p>Thank you for completing a voice recording session with us. To proceed with your payment, please add a supported payment method in your dashboard (Stripe, PayPal, Revolut, or Wise).</p>
          
          <p>Once added, we'll be able to process your compensation promptly.</p>
          
          <p>Best regards,<br>Support Team</p>
        </div>
      </div>
    </body>
    </html>
  `;
};

export const getUsersWithoutPaymentMethod: RequestHandler = async (
  req: Request,
  res: Response
) => {
  try {
    const users = await prisma.user.findMany({
      where: {
        user_type: "user",
        language: "Arabic",
        adminVerify: "active",
      },
      select: {
        id: true,
        name: true,
        email: true,
        stripeAccountId: true,
        stripeChargesEnabled: true,
        stripeDetailsSubmitted: true,
        stripeOnboardingComplete: true,
        stripePayoutsEnabled: true,
        paypalEmail: true,
        wiseEmail: true,
        revolutEmail: true,
        conversations: {
          select: {
            earnings: true,
            paymentStatus: true,
            status: true,
          },
          where: {
            status: "completed",
            flagged_status: false,
          },
        },
      },
    });

    const usersWithoutPayment = users.filter((user) => {
      const hasPayment = hasPaymentMethod(user);

      const unpaidBalance = user.conversations
        .filter((conv) => conv.paymentStatus === "unpaid")
        .reduce((sum, conv) => sum + parseFloat(conv.earnings.toString()), 0);

      return !hasPayment && unpaidBalance > 0;
    });

    const formattedUsers = usersWithoutPayment.map((user) => {
      const unpaidBalance = user.conversations
        .filter((conv) => conv.paymentStatus === "unpaid")
        .reduce((sum, conv) => sum + parseFloat(conv.earnings.toString()), 0);

      return {
        id: user.id,
        name: user.name || "N/A",
        email: user.email,
        unpaid_balance: parseFloat(unpaidBalance.toFixed(2)),
      };
    });

    return res.status(200).json({
      success: true,
      count: formattedUsers.length,
      users: formattedUsers,
    });
  } catch (err) {
    logger.error(`Error getting users without payment method: ${err}`);
    if (!res.headersSent) {
      return internalServerError(res);
    }
  } finally {
    await prisma.$disconnect();
  }
};

export const sendPaymentReminderToUser: RequestHandler = async (
  req: Request,
  res: Response
) => {
  try {
    const { userId } = req.params;

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: "User ID is required",
      });
    }

    const userIdInt = parseInt(userId);

    const user = await prisma.user.findFirst({
      where: {
        id: userIdInt,
        user_type: "user",
        language: "Arabic",
        adminVerify: "active",
      },
      select: {
        id: true,
        name: true,
        email: true,
        stripeAccountId: true,
        stripeChargesEnabled: true,
        stripeDetailsSubmitted: true,
        stripeOnboardingComplete: true,
        stripePayoutsEnabled: true,
        paypalEmail: true,
        wiseEmail: true,
        revolutEmail: true,
        conversations: {
          select: {
            earnings: true,
            paymentStatus: true,
            status: true,
          },
          where: {
            status: "completed",
            flagged_status: false,
          },
        },
      },
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found or not an active Arabic user",
      });
    }

    const hasPayment = hasPaymentMethod(user);
    if (hasPayment) {
      return res.status(400).json({
        success: false,
        message: "User already has a payment method configured",
      });
    }

    const unpaidBalance = user.conversations
      .filter((conv) => conv.paymentStatus === "unpaid")
      .reduce((sum, conv) => sum + parseFloat(conv.earnings.toString()), 0);

    if (unpaidBalance <= 0) {
      return res.status(400).json({
        success: false,
        message: "User has no unpaid balance",
      });
    }

    const emailHTML = generatePaymentReminderEmail(
      user.name || "User",
      unpaidBalance
    );

    try {
      await email_transporter.sendMail({
        from: process.env.GOOGLE_APP_EMAIL_FROM,
        to: user.email,
        subject: "Payment Method Required to Process Your Payment",
        html: emailHTML,
      });

      logger.info(
        `Payment method reminder sent to user ${user.id} (${user.email})`
      );

      return res.status(200).json({
        success: true,
        message: `Reminder email sent successfully to ${user.email}`,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          unpaid_balance: unpaidBalance,
        },
      });
    } catch (emailError) {
      logger.error(`Failed to send email to ${user.email}: ${emailError}`);
      return res.status(500).json({
        success: false,
        message: "Failed to send reminder email",
        error: String(emailError),
      });
    }
  } catch (err) {
    logger.error(`Error sending payment reminder to user: ${err}`);
    if (!res.headersSent) {
      return internalServerError(res);
    }
  } finally {
    await prisma.$disconnect();
  }
};

export const sendPaymentMethodReminders: RequestHandler = async (
  req: Request,
  res: Response
) => {
  try {
    const users = await prisma.user.findMany({
      where: {
        user_type: "user",
        language: "Arabic",
        adminVerify: "active",
      },
      select: {
        id: true,
        name: true,
        email: true,
        stripeAccountId: true,
        stripeChargesEnabled: true,
        stripeDetailsSubmitted: true,
        stripeOnboardingComplete: true,
        stripePayoutsEnabled: true,
        paypalEmail: true,
        wiseEmail: true,
        revolutEmail: true,
        conversations: {
          select: {
            earnings: true,
            paymentStatus: true,
            status: true,
          },
          where: {
            status: "completed",
            flagged_status: false,
          },
        },
      },
    });

    const usersWithoutPayment = users.filter((user) => {
      const hasPayment = hasPaymentMethod(user);

      const unpaidBalance = user.conversations
        .filter((conv) => conv.paymentStatus === "unpaid")
        .reduce((sum, conv) => sum + parseFloat(conv.earnings.toString()), 0);

      return !hasPayment && unpaidBalance > 0;
    });

    if (usersWithoutPayment.length === 0) {
      return res.status(200).json({
        success: true,
        message: "No users without payment methods found",
        emails_sent: 0,
      });
    }

    const emailPromises = usersWithoutPayment.map(async (user) => {
      const unpaidBalance = user.conversations
        .filter((conv) => conv.paymentStatus === "unpaid")
        .reduce((sum, conv) => sum + parseFloat(conv.earnings.toString()), 0);

      const emailHTML = generatePaymentReminderEmail(
        user.name || "User",
        unpaidBalance
      );

      try {
        await email_transporter.sendMail({
          from: process.env.GOOGLE_APP_EMAIL_FROM,
          to: user.email,
          subject: "Payment Method Required to Process Your Payment",
          html: emailHTML,
        });

        logger.info(`Payment method reminder sent to ${user.email}`);
        return { success: true, email: user.email };
      } catch (error) {
        logger.error(`Failed to send email to ${user.email}: ${error}`);
        return { success: false, email: user.email, error };
      }
    });

    const results = await Promise.all(emailPromises);
    const successCount = results.filter((r) => r.success).length;
    const failedCount = results.filter((r) => !r.success).length;

    return res.status(200).json({
      success: true,
      message: `Sent ${successCount} emails successfully`,
      emails_sent: successCount,
      failed: failedCount,
      total_users: usersWithoutPayment.length,
    });
  } catch (err) {
    logger.error(`Error sending payment method reminders: ${err}`);
    if (!res.headersSent) {
      return internalServerError(res);
    }
  } finally {
    await prisma.$disconnect();
  }
};

function calculateAge(dateOfBirth: string) {
  const dob = new Date(dateOfBirth);
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const monthDiff = today.getMonth() - dob.getMonth();

  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) {
    age--;
  }

  return age;
}

export const createAnnotator: RequestHandler = async (
  req: Request,
  res: Response
) => {
  try {
    const { username, password, annotation_recordings, email } = req.body;

    if (!username || !password) {
      return res.status(400).json({
        error: "Username and password are required",
      });
    }

    if (!validateEmail(email)) {
      return res.status(400).json({
        success: false,
        message: "Email that you provided is not valid",
      });
    }

    const existingUser = await prisma.user.findFirst({
      where: {
        OR: [{ username: username }, { email: email }],
      },
    });

    if (existingUser) {
      return res.status(400).json({
        error: "user with email or username already exists",
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const annotator = await prisma.user.create({
      data: {
        username,
        password: hashedPassword,
        email: email,
        user_type: "user",
        verified: true,
        is_annotator: true,
        email_verified: true,
        adminVerify: "active",
        annotation_recordings: annotation_recordings || [],
      },
    });

    return res.status(201).json({
      success: true,
      message: "Annotator created successfully",
      annotator: {
        id: annotator.id,
        username: annotator.username,
        annotation_recordings: annotator.annotation_recordings,
      },
    });
  } catch (err) {
    logger.error(`Error creating annotator: ${err}`);
    if (!res.headersSent) {
      return internalServerError(res);
    }
  } finally {
    await prisma.$disconnect();
  }
};

export const listAnnotators: RequestHandler = async (
  req: Request,
  res: Response
) => {
  try {
    const annotators = await prisma.user.findMany({
      where: {
        is_annotator: true,
      },
      select: {
        id: true,
        username: true,
        email: true,
        annotation_recordings: true,
        createdAt: true,
        adminVerify: true,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    return res.status(200).json({ annotators });
  } catch (err) {
    logger.error(`Error listing annotators: ${err}`);
    if (!res.headersSent) {
      return internalServerError(res);
    }
  } finally {
    await prisma.$disconnect();
  }
};

export const updateAnnotatorFolders: RequestHandler = async (
  req: Request,
  res: Response
) => {
  try {
    const { annotatorId } = req.params;
    const { annotation_recordings } = req.body;

    const annotator = await prisma.user.update({
      where: {
        id: parseInt(annotatorId),
        is_annotator: true,
      },
      data: {
        annotation_recordings: annotation_recordings,
      },
    });

    return res.status(200).json({
      success: true,
      message: "Annotator folders updated",
      annotator: {
        id: annotator.id,
        username: annotator.username,
        annotation_recordings: annotator.annotation_recordings,
      },
    });
  } catch (err) {
    logger.error(`Error updating annotator: ${err}`);
    if (!res.headersSent) {
      return internalServerError(res);
    }
  } finally {
    await prisma.$disconnect();
  }
};

export const deleteAnnotator: RequestHandler = async (
  req: Request,
  res: Response
) => {
  try {
    const { annotatorId } = req.params;

    await prisma.user.delete({
      where: {
        id: parseInt(annotatorId),
        is_annotator: true,
      },
    });

    return res.status(200).json({
      success: true,
      message: "Annotator deleted successfully",
    });
  } catch (err) {
    logger.error(`Error deleting annotator: ${err}`);
    if (!res.headersSent) {
      return internalServerError(res);
    }
  } finally {
    await prisma.$disconnect();
  }
};

export const assignRecordingsToSpecificAnnotator: RequestHandler = async (
  req: Request,
  res: Response
) => {
  let responseSent = false;

  const sendResponse = (statusCode: number, data: any) => {
    if (!responseSent && !res.headersSent) {
      responseSent = true;
      return res.status(statusCode).json(data);
    }
  };

  try {
    const { annotatorId, recordingsPerAnnotator = 25 } = req.body;

    if (!annotatorId) {
      return sendResponse(400, { error: "Annotator ID is required" });
    }

    const annotator = await prisma.user.findUnique({
      where: {
        id: annotatorId,
        is_annotator: true,
      },
      select: {
        id: true,
        username: true,
        annotation_recordings: true,
      },
    });

    if (!annotator) {
      return sendResponse(404, {
        error: "Annotator not found or user is not an annotator",
      });
    }

    const allAnnotators = await prisma.user.findMany({
      where: { is_annotator: true },
      select: { annotation_recordings: true },
    });

    const alreadyAssignedRecordings = new Set<string>();
    allAnnotators.forEach((ann) => {
      ann.annotation_recordings?.forEach((recording) => {
        alreadyAssignedRecordings.add(recording);
        alreadyAssignedRecordings.add(decodeURIComponent(recording));
      });
    });

    logger.info(
      `Found ${alreadyAssignedRecordings.size} already assigned recordings`
    );

    const allDatesCommand = new ListObjectsV2Command({
      Bucket: BUCKET_NAME,
      Prefix: "Arabic/",
      Delimiter: "/",
    });

    const allDatesResponse = await s3.send(allDatesCommand);
    const allDates =
      allDatesResponse.CommonPrefixes?.map((prefix) => prefix.Prefix) || [];

    const lastTwoDates = allDates.sort((a, b) => a.localeCompare(b)).slice(-4);

    logger.info(
      `Found ${
        allDates.length
      } date folders, scanning only last 4: ${lastTwoDates.join(", ")}`
    );

    const availableRecordings: string[] = [];
    let skippedNoConversation = 0;
    let skippedTooSmall = 0;
    let skippedNoMetadata = 0;
    let skippedNoTranscription = 0;

    const MIN_SIZE_BYTES = 900 * 1024;

    outerLoop: for (const dateFolder of allDates) {
      const timeFoldersCommand = new ListObjectsV2Command({
        Bucket: BUCKET_NAME,
        Prefix: dateFolder,
        Delimiter: "/",
      });

      const timeFoldersResponse = await s3.send(timeFoldersCommand);
      const timeFolders = timeFoldersResponse.CommonPrefixes || [];

      for (const timePrefix of timeFolders) {
        const recordingsCommand = new ListObjectsV2Command({
          Bucket: BUCKET_NAME,
          Prefix: timePrefix.Prefix,
          Delimiter: "/",
        });

        const recordingsResponse = await s3.send(recordingsCommand);
        const recordingFolders = recordingsResponse.CommonPrefixes || [];

        for (const recordingPrefix of recordingFolders) {
          if (availableRecordings.length >= recordingsPerAnnotator)
            break outerLoop;
          if (!recordingPrefix.Prefix) continue;

          const isAssigned =
            alreadyAssignedRecordings.has(recordingPrefix.Prefix) ||
            alreadyAssignedRecordings.has(
              decodeURIComponent(recordingPrefix.Prefix)
            );

          if (isAssigned) continue;

          const filesCommand = new ListObjectsV2Command({
            Bucket: BUCKET_NAME,
            Prefix: recordingPrefix.Prefix,
          });

          const filesResponse = await s3.send(filesCommand);
          const files = filesResponse.Contents || [];

          const hasTranscription = files.some(
            (file) =>
              file.Key?.endsWith("transcription.txt") ||
              file.Key?.endsWith("Transcription.txt")
          );
          if (!hasTranscription) {
            skippedNoTranscription++;
            continue;
          }

          const hasMetadata = files.some((file) =>
            file.Key?.endsWith("metadata.txt")
          );
          if (!hasMetadata) {
            skippedNoMetadata++;
            continue;
          }

          const hasAnnotation = files.some((file) =>
            file.Key?.endsWith("human_transcript.txt")
          );
          if (hasAnnotation) continue;

          const conversationFile = files.find(
            (file) =>
              file.Key?.endsWith("conversation.mp3") ||
              file.Key?.endsWith("Conversation.mp3")
          );

          if (!conversationFile || !conversationFile.Key) {
            skippedNoConversation++;
            continue;
          }

          const fileSize = conversationFile.Size || 0;
          if (fileSize < MIN_SIZE_BYTES) {
            skippedTooSmall++;
            logger.info(
              `Skipped ${recordingPrefix.Prefix} - size: ${(
                fileSize / 1024
              ).toFixed(0)} KB`
            );
            continue;
          }

          availableRecordings.push(recordingPrefix.Prefix);
        }
      }
    }

    logger.info(
      `Found ${availableRecordings.length} available recordings (skipped ${skippedNoConversation} no mp3, ${skippedTooSmall} too small, ${skippedNoMetadata} no metadata, ${skippedNoTranscription} no transcription)`
    );

    if (availableRecordings.length === 0) {
      return sendResponse(404, {
        error: "No available unassigned recordings found",
        details: {
          skippedNoConversation,
          skippedTooSmall,
          skippedNoMetadata,
          skippedNoTranscription,
          minSizeRequired: `${MIN_SIZE_BYTES / 1024} KB`,
        },
      });
    }

    const existingRecordings = annotator.annotation_recordings || [];
    const combinedRecordings = [...existingRecordings, ...availableRecordings];

    await prisma.user.update({
      where: { id: annotator.id },
      data: { annotation_recordings: combinedRecordings },
    });

    return sendResponse(200, {
      success: true,
      message: `Successfully assigned ${availableRecordings.length} recordings to ${annotator.username}`,
      assignment: {
        annotatorId: annotator.id,
        username: annotator.username,
        previousCount: existingRecordings.length,
        newCount: combinedRecordings.length,
        addedCount: availableRecordings.length,
        skippedNoConversation,
        skippedTooSmall,
        skippedNoMetadata,
        skippedNoTranscription,
        minSizeRequired: `${MIN_SIZE_BYTES / 1024} KB`,
      },
    });
  } catch (err: any) {
    logger.error(`Error assigning recordings: ${err.message}`);
    return sendResponse(500, {
      error: "Internal server error",
      message: err.message,
    });
  } finally {
    await prisma.$disconnect();
  }
};

export const clearAnnotatorAssignments: RequestHandler = async (
  req: Request,
  res: Response
) => {
  try {
    const { annotatorId } = req.params;

    if (!annotatorId) {
      return res.status(400).json({
        error: "Annotator ID is required",
      });
    }

    const annotator = await prisma.user.findUnique({
      where: {
        id: parseInt(annotatorId),
        is_annotator: true,
      },
      select: {
        id: true,
        username: true,
        annotation_recordings: true,
      },
    });

    if (!annotator) {
      return res.status(404).json({
        error: "Annotator not found",
      });
    }

    const clearedCount = annotator.annotation_recordings?.length || 0;

    await prisma.user.update({
      where: { id: annotator.id },
      data: {
        annotation_recordings: [],
      },
    });

    return res.status(200).json({
      success: true,
      message: `Cleared ${clearedCount} assignments from ${annotator.username}`,
      annotator: {
        id: annotator.id,
        username: annotator.username,
        clearedCount,
      },
    });
  } catch (err) {
    logger.error(`Error clearing annotator assignments: ${err}`);
    if (!res.headersSent) {
      return internalServerError(res);
    }
  } finally {
    await prisma.$disconnect();
  }
};

export const clearAllAssignments: RequestHandler = async (
  req: Request,
  res: Response
) => {
  try {
    const result = await prisma.user.updateMany({
      where: { is_annotator: true },
      data: {
        annotation_recordings: [],
      },
    });

    return res.status(200).json({
      success: true,
      message: `Cleared assignments for ${result.count} annotators`,
    });
  } catch (err) {
    logger.error(`Error clearing assignments: ${err}`);
    if (!res.headersSent) {
      return internalServerError(res);
    }
  } finally {
    await prisma.$disconnect();
  }
};

export const getAssignmentStats: RequestHandler = async (
  req: Request,
  res: Response
) => {
  try {
    const annotators = await prisma.user.findMany({
      where: { is_annotator: true },
      select: {
        id: true,
        username: true,
        annotation_recordings: true,
      },
    });

    const statsPromises = annotators.map(async (annotator) => {
      let totalDurationSeconds = 0;
      const recordingPaths = annotator.annotation_recordings || [];

      for (const recordingPath of recordingPaths) {
        try {
          const metadataKey = `${recordingPath}metadata.txt`;

          const metadataCommand = new GetObjectCommand({
            Bucket: BUCKET_NAME,
            Key: metadataKey,
          });

          const metadataResponse = await s3.send(metadataCommand);

          const metadataContent =
            await metadataResponse.Body?.transformToString();

          if (metadataContent) {
            const metadata = JSON.parse(metadataContent);

            if (metadata.total_duration) {
              totalDurationSeconds += metadata.total_duration;
            }
          }
        } catch (err) {
          logger.warn(`Could not read metadata for ${recordingPath}: ${err}`);
        }
      }

      const totalDurationHours = totalDurationSeconds / 3600;

      return {
        id: annotator.id,
        username: annotator.username,
        totalAssigned: recordingPaths.length,
        totalDurationSeconds: parseFloat(totalDurationSeconds.toFixed(2)),
        totalDurationHours: parseFloat(totalDurationHours.toFixed(2)),
        totalDurationFormatted: formatDuration(totalDurationSeconds),
        recordings: recordingPaths,
      };
    });

    const stats = await Promise.all(statsPromises);

    const totalAssigned = stats.reduce(
      (sum, stat) => sum + stat.totalAssigned,
      0
    );

    const totalDurationSeconds = stats.reduce(
      (sum, stat) => sum + stat.totalDurationSeconds,
      0
    );

    const totalDurationHours = totalDurationSeconds / 3600;

    return res.status(200).json({
      totalAnnotators: annotators.length,
      totalAssigned,
      totalDurationSeconds: parseFloat(totalDurationSeconds.toFixed(2)),
      totalDurationHours: parseFloat(totalDurationHours.toFixed(2)),
      totalDurationFormatted: formatDuration(totalDurationSeconds),
      averagePerAnnotator:
        annotators.length > 0 ? totalAssigned / annotators.length : 0,
      averageDurationPerAnnotator:
        annotators.length > 0
          ? parseFloat((totalDurationHours / annotators.length).toFixed(2))
          : 0,
      annotators: stats,
    });
  } catch (err) {
    logger.error(`Error getting assignment stats: ${err}`);
    if (!res.headersSent) {
      return internalServerError(res);
    }
  } finally {
    await prisma.$disconnect();
  }
};

function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  return `${hours.toString().padStart(2, "0")}:${minutes
    .toString()
    .padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
}

export const getAvailableRecordingsCount: RequestHandler = async (
  req: Request,
  res: Response
) => {
  try {
    const allAnnotators = await prisma.user.findMany({
      where: { is_annotator: true },
      select: {
        annotation_recordings: true,
      },
    });

    const alreadyAssignedRecordings = new Set<string>();
    allAnnotators.forEach((ann) => {
      ann.annotation_recordings?.forEach((recording) => {
        alreadyAssignedRecordings.add(recording);
      });
    });

    // Get ALL date folders (not just last 10)
    const allDatesCommand = new ListObjectsV2Command({
      Bucket: BUCKET_NAME,
      Prefix: "Arabic/",
      Delimiter: "/",
    });

    const allDatesResponse = await s3.send(allDatesCommand);
    const allDates =
      allDatesResponse.CommonPrefixes?.map((prefix) => ({
        name: prefix.Prefix?.replace("Arabic/", "").replace("/", ""),
        path: prefix.Prefix,
      })) || [];

    allDates.sort((a, b) => b.name.localeCompare(a.name));

    let totalRecordings = 0;
    let annotatedRecordings = 0;
    let assignedRecordings = alreadyAssignedRecordings.size;
    let availableRecordings = 0;

    // Loop through ALL dates
    for (const dateFolder of allDates) {
      const timeFoldersCommand = new ListObjectsV2Command({
        Bucket: BUCKET_NAME,
        Prefix: dateFolder.path,
        Delimiter: "/",
      });

      const timeFoldersResponse = await s3.send(timeFoldersCommand);
      const timeFolders = timeFoldersResponse.CommonPrefixes || [];

      for (const timePrefix of timeFolders) {
        const recordingsCommand = new ListObjectsV2Command({
          Bucket: BUCKET_NAME,
          Prefix: timePrefix.Prefix,
          Delimiter: "/",
        });

        const recordingsResponse = await s3.send(recordingsCommand);
        const recordingFolders = recordingsResponse.CommonPrefixes || [];

        for (const recordingPrefix of recordingFolders) {
          if (!recordingPrefix.Prefix) continue;

          totalRecordings++;

          const filesCommand = new ListObjectsV2Command({
            Bucket: BUCKET_NAME,
            Prefix: recordingPrefix.Prefix,
          });

          const filesResponse = await s3.send(filesCommand);
          const hasAnnotation = filesResponse.Contents?.some((file) =>
            file.Key?.endsWith("human_transcript.txt")
          );

          if (hasAnnotation) {
            annotatedRecordings++;
          } else if (!alreadyAssignedRecordings.has(recordingPrefix.Prefix)) {
            availableRecordings++;
          }
        }
      }
    }

    return res.status(200).json({
      totalRecordings,
      annotatedRecordings,
      assignedRecordings,
      availableRecordings,
      dateRange: {
        from: allDates[allDates.length - 1]?.name,
        to: allDates[0]?.name,
        totalDays: allDates.length,
      },
    });
  } catch (err) {
    logger.error(`Error getting available recordings count: ${err}`);
    if (!res.headersSent) {
      return internalServerError(res);
    }
  } finally {
    await prisma.$disconnect();
  }
};

export const getPayrollData: RequestHandler = async (
  req: Request,
  res: Response
) => {
  try {
    const users = await prisma.user.findMany({
      where: {
        user_type: "user",
        language: "Arabic",
        conversations: {
          some: {
            paymentStatus: "unpaid",
            status: "completed",
            flagged_status: false,
          },
        },
      },
      include: {
        conversations: {
          where: {
            paymentStatus: "unpaid",
            status: "completed",
            flagged_status: false,
          },
          select: {
            id: true,
            duration: true,
            quality: true,
            earnings: true,
            paymentStatus: true,
            status: true,
            meetingId: true,
            meeting: { select: { language: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const formattedUsers = await Promise.all(
      users.map(async (user) => {
        const numConversations = user.conversations.length;

        const totalBalance = user.conversations.reduce(
          (sum, conv) => sum + Number(conv.earnings || 0),
          0
        );

        const totalRecordingMinutes =
          user.conversations.reduce(
            (sum, conv) => sum + Number(conv.duration || 0),
            0
          ) / 60;

        const averageQualityScore =
          numConversations > 0
            ? user.conversations.reduce(
                (sum, conv) => sum + Number(conv.quality || 0),
                0
              ) / numConversations
            : 0;

        const age = user.date_of_birth
          ? calculateAge(user.date_of_birth)
          : null;

        const flaggedCount = await prisma.conversation.count({
          where: {
            userId: user.id,
            flagged_status: true,
            status: "completed",
            meeting: { language: "Arabic" },
          },
        });

        const roomAgg = user.conversations.reduce(
          (acc, conv) => {
            const roomId = Number(conv.meetingId);
            const earnings = Number(conv.earnings || 0);
            const minutes = Number(conv.duration || 0) / 60;

            if (!Number.isFinite(roomId)) return acc;

            acc.room_amounts[roomId] =
              (acc.room_amounts[roomId] || 0) + earnings;
            acc.room_minutes[roomId] =
              (acc.room_minutes[roomId] || 0) + minutes;

            return acc;
          },
          {
            room_amounts: {} as Record<number, number>,
            room_minutes: {} as Record<number, number>,
          }
        );

        const uniqueRoomIds = Object.keys(roomAgg.room_amounts).map(Number);
        const roomIdsString = JSON.stringify(uniqueRoomIds);

        const hasStripe =
          user.stripeAccountId &&
          user.stripeAccountId !== "N/A" &&
          user.stripeAccountId !== "" &&
          user.stripeChargesEnabled === true &&
          user.stripeDetailsSubmitted === true &&
          user.stripeOnboardingComplete === true &&
          user.stripePayoutsEnabled === true;

        const hasPayPal =
          user.paypalEmail &&
          user.paypalEmail !== "N/A" &&
          user.paypalEmail !== "";
        const hasWise =
          user.wiseEmail && user.wiseEmail !== "N/A" && user.wiseEmail !== "";
        const hasRevolut =
          user.revolutEmail &&
          user.revolutEmail !== "N/A" &&
          user.revolutEmail !== "";
        const hasInstapay =
          user.instaPayEnabled === true &&
          user.instaPayPhone &&
          user.instaPayPhone !== "N/A" &&
          user.instaPayPhone !== "";

        let paymentMethod: any = null;
        if (hasStripe) paymentMethod = "stripe";
        else if (hasPayPal) paymentMethod = "paypal";
        else if (hasWise) paymentMethod = "wise";
        else if (hasRevolut) paymentMethod = "revolut";
        else if (hasInstapay) paymentMethod = "instapay";

        return {
          user_id: String(user.id),
          email: user.email,
          full_name: user.name || "N/A",
          age,
          language: user.language || "N/A",
          dialect: user.language_dialect || "N/A",

          total_recording_minutes: Number(totalRecordingMinutes.toFixed(2)),
          num_conversations: numConversations,
          total_balance: Number(totalBalance.toFixed(2)),
          average_quality_score: Number(averageQualityScore.toFixed(2)),

          status: user.adminVerify,

          stripe_account_id: user.stripeAccountId || "N/A",
          stripeOnboardingComplete: user.stripeOnboardingComplete,
          stripeDetailsSubmitted: user.stripeDetailsSubmitted,
          stripeChargesEnabled: user.stripeChargesEnabled,
          stripePayoutsEnabled: user.stripePayoutsEnabled,

          paypalEmail: user.paypalEmail || "N/A",
          wiseEmail: user.wiseEmail || "N/A",
          revolutEmail: user.revolutEmail || "N/A",

          instaPayPhone: user.instaPayPhone || "N/A",
          instaPayEnabled: user.instaPayEnabled === true,

          payment_method: paymentMethod,
          flagged_count: flaggedCount,

          room_ids: roomIdsString,

          room_amounts: roomAgg.room_amounts,
          room_minutes: roomAgg.room_minutes,
        };
      })
    );

    const usersWithBalance = formattedUsers.filter((u) => u.total_balance > 0);

    return res.status(200).json({
      success: true,
      count: usersWithBalance.length,
      users: usersWithBalance,
    });
  } catch (err) {
    logger.error(`Error getting payroll data: ${err}`);
    if (!res.headersSent) return internalServerError(res);
  } finally {
    await prisma.$disconnect();
  }
};

export const updateAnnotator: RequestHandler = async (
  req: Request,
  res: Response
) => {
  try {
    const { annotatorId } = req.params;
    const { email, password, annotation_recordings, adminVerify } = req.body;

    const annotator = await prisma.user.findUnique({
      where: {
        id: parseInt(annotatorId),
        is_annotator: true,
      },
    });

    if (!annotator) {
      return res.status(404).json({
        error: "Annotator not found",
      });
    }

    const updateData: any = {};

    // Update email if provided
    if (email && email !== annotator.email) {
      if (!validateEmail(email)) {
        return res.status(400).json({
          success: false,
          message: "Email is not valid",
        });
      }

      const existingUser = await prisma.user.findFirst({
        where: {
          email: email,
          NOT: { id: parseInt(annotatorId) },
        },
      });

      if (existingUser) {
        return res.status(400).json({
          error: "Email already in use by another user",
        });
      }

      updateData.email = email;
    }

    // Update password if provided
    if (password && password.trim()) {
      if (password.length < 6) {
        return res.status(400).json({
          error: "Password must be at least 6 characters",
        });
      }
      updateData.password = await bcrypt.hash(password, 10);
    }

    // Update folders if provided
    if (annotation_recordings !== undefined) {
      updateData.annotation_recordings = annotation_recordings;
    }

    // Update status if provided
    if (adminVerify) {
      updateData.adminVerify = adminVerify;
    }

    const updated = await prisma.user.update({
      where: { id: parseInt(annotatorId) },
      data: updateData,
      select: {
        id: true,
        username: true,
        email: true,
        annotation_recordings: true,
        adminVerify: true,
      },
    });

    return res.status(200).json({
      success: true,
      message: "Annotator updated successfully",
      annotator: updated,
    });
  } catch (err) {
    logger.error(`Error updating annotator: ${err}`);
    if (!res.headersSent) {
      return internalServerError(res);
    }
  } finally {
    await prisma.$disconnect();
  }
};

export const getAnnotatorById: RequestHandler = async (
  req: Request,
  res: Response
) => {
  try {
    const { annotatorId } = req.params;

    const annotator = await prisma.user.findUnique({
      where: {
        id: parseInt(annotatorId),
        is_annotator: true,
      },
      select: {
        id: true,
        username: true,
        email: true,
        annotation_recordings: true,
        adminVerify: true,
        createdAt: true,
      },
    });

    if (!annotator) {
      return res.status(404).json({
        error: "Annotator not found",
      });
    }

    return res.status(200).json({ annotator });
  } catch (err) {
    logger.error(`Error getting annotator: ${err}`);
    if (!res.headersSent) {
      return internalServerError(res);
    }
  } finally {
    await prisma.$disconnect();
  }
};
