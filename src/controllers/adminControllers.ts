import { prisma } from "../config/postgres";
import { Request, Response, RequestHandler } from "express";
import { internalServerError } from "./errors";
import dotenv from "dotenv";
import { logger } from "../utils/logger";

dotenv.config();

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
        status: "completed",
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
            ? `user_${otherParticipant.userId}`
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
      where: { id: parseInt(conversation_id) },
    });

    if (!conversation) {
      return res
        .status(404)
        .json({ success: false, message: "conversation not found" });
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

    const user = await prisma.user.findFirst({ where: { id: userIdInt } });

    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "user not found" });
    }

    const countAsMainUser = await prisma.conversation.count({
      where: {
        userId: user.id,
        flagged_status: true,
        status: "completed",
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

    const user = await prisma.user.findFirst({ where: { id: userIdInt } });

    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "user not found" });
    }

    const participations = await prisma.meetingParticipant.findMany({
      where: {
        userId: user.id,
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

    const user = await prisma.user.findFirst({ where: { id: userIdInt } });

    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "user not found" });
    }

    const unpaidConversations = await prisma.conversation.findMany({
      where: {
        userId: user.id,
        paymentStatus: "unpaid",
        flagged_status: false,
        status: "completed",
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
          where: { status: "completed", flagged_status: false },
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
      return res.status(404).json({ error: "Room not found" });
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
    });

    const formattedUsers = users.map((user) => {
      const totalRecordingMinutes =
        user.conversations.reduce((sum, conv) => {
          return sum + parseFloat(conv.duration.toString());
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

      const status = user.adminVerify ? "active" : "suspended";

      return {
        user_id: `${user.id}`,
        email: user.email,
        full_name: user.name || "N/A",
        age: age,
        language: user.language || "N/A",
        dialect: user.language_dialect || "N/A",
        total_recording_minutes: parseFloat(totalRecordingMinutes.toFixed(1)),
        num_conversations: numConversations,
        total_money_earned: parseFloat(totalMoneyEarned.toFixed(2)),
        total_balance: parseFloat(totalBalance.toFixed(2)),
        amount_paid: parseFloat(amountPaid.toFixed(2)),
        average_quality_score: parseFloat(averageQualityScore.toFixed(2)),
        status: status,
        stripe_account_id: user.stripeAccountId || "N/A",
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
    const meetings = await prisma.meeting.findMany({
      where: {
        conversations: {
          some: {
            status: "completed",
            flagged_status: false,
          },
        },
      },
      select: {
        language: true,
      },
      distinct: ["language"],
    });

    const languageStats = await Promise.all(
      meetings.map(async (meeting) => {
        const stats = await prisma.conversation.aggregate({
          where: {
            meeting: {
              language: meeting.language,
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

        const totalDurationSeconds = stats._sum.duration
          ? parseFloat(stats._sum.duration.toString())
          : 0;

        const totalHours = parseFloat((totalDurationSeconds / 3600).toFixed(2));

        return {
          language: meeting.language,
          total_hours: totalHours,
          total_conversations: stats._count.id,
        };
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

export const markRoomsAsPaid: RequestHandler = async (
  req: Request,
  res: Response
) => {
  try {
    const { room_ids } = req.body;

    if (!room_ids || !Array.isArray(room_ids) || room_ids.length === 0) {
      return res.status(400).json({ error: "Room IDs array is required" });
    }

    const result = await prisma.conversation.updateMany({
      where: {
        meeting: {
          sessionName: {
            in: room_ids,
          },
        },
        flagged_status: false,
        paymentStatus: "unpaid",
      },
      data: {
        paymentStatus: "paid",
        paidAt: new Date(),
      },
    });

    return res.status(200).json({
      success: true,
      message: `Marked ${result.count} conversations as paid`,
      updated_count: result.count,
    });
  } catch (err) {
    logger.error(`Error marking rooms as paid: ${err}`);
    if (!res.headersSent) {
      return internalServerError(res);
    }
  } finally {
    await prisma.$disconnect();
  }
};

export const undoPayroll: RequestHandler = async (
  req: Request,
  res: Response
) => {
  try {
    const { room_ids } = req.body;

    if (!room_ids || !Array.isArray(room_ids) || room_ids.length === 0) {
      return res.status(400).json({ error: "Room IDs array is required" });
    }

    const result = await prisma.conversation.updateMany({
      where: {
        meeting: {
          sessionName: {
            in: room_ids,
          },
        },
        paymentStatus: "paid",
      },
      data: {
        paymentStatus: "unpaid",
        paidAt: null,
      },
    });

    return res.status(200).json({
      success: true,
      message: `Reverted ${result.count} conversations back to unpaid`,
      updated_count: result.count,
    });
  } catch (err) {
    logger.error(`Error undoing payroll: ${err}`);
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
