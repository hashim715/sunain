import { Request, Response, NextFunction, RequestHandler } from "express";
import { internalServerError } from "./errors";
import jwt_decode from "jwt-decode";
import { prisma } from "../config/postgres";
import { logger } from "../utils/logger";
import { uploadToS3 } from "../utils/uploadToS3";
import { validateEmail } from "../utils/checkvalidEmail";

export const getAuthorizedUrl: RequestHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    return res.status(200).json({ success: true, message: "Authorized url" });
  } catch (err) {
    if (!res.headersSent) {
      return internalServerError(res);
    }
  } finally {
    await prisma.$disconnect();
  }
};

export const refreshAccessTokenController: RequestHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    return res
      .status(200)
      .json({ success: true, message: "Token refreshed successfully" });
  } catch (err) {
    if (!res.headersSent) {
      return internalServerError(res);
    }
  } finally {
    await prisma.$disconnect();
  }
};

export const addUserDetails: RequestHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    let { backgroundInfo, paymentMethod, paymentContactInfo } = req.body;

    if (!backgroundInfo) {
      return res
        .status(400)
        .json({ success: false, message: "Please enter valid input" });
    }

    backgroundInfo = JSON.parse(req.body.backgroundInfo);

    if (
      !backgroundInfo.firstName ||
      !backgroundInfo.lastName ||
      !backgroundInfo.dateOfBirth ||
      !backgroundInfo.gender ||
      !backgroundInfo.ethnicity ||
      !backgroundInfo.cityOfResidence ||
      !backgroundInfo.areaGrowUp ||
      !backgroundInfo.nativeLanguage ||
      !backgroundInfo.cityOfResidence ||
      !backgroundInfo.country ||
      !backgroundInfo.countryCode ||
      !backgroundInfo.state ||
      !backgroundInfo.dialect ||
      !backgroundInfo.educationLevel ||
      !backgroundInfo.languageProficiency ||
      !backgroundInfo.languageUsage ||
      !backgroundInfo.quizAnswers ||
      Object.keys(backgroundInfo.quizAnswers).length !== 4
    ) {
      return res
        .status(400)
        .json({ success: false, message: "Please enter valid input" });
    }

    const isObject =
      typeof backgroundInfo.languageProficiency === "object" &&
      !Array.isArray(backgroundInfo.languageProficiency);

    if (!isObject) {
      return res
        .status(400)
        .json({ success: false, message: "Please enter valid input" });
    }

    if (!paymentMethod || !paymentContactInfo) {
      return res
        .status(400)
        .json({ success: false, message: "Please enter valid payment method" });
    }

    const audioDuration = req.body.audioDuration;

    const audioFile = req.file;

    if (!audioDuration || !audioFile || audioDuration < 10) {
      return res
        .status(400)
        .json({ success: false, message: "Please enter valid input" });
    }

    const token = req.cookies.authToken;

    const { username }: { username: string } = jwt_decode(token);

    const user = await prisma.user.findFirst({ where: { username: username } });

    const s3Key = `audio_samples/${
      user.id
    }-${Date.now()}.${audioFile.originalname.split(".").pop()}`;

    const audioUrl = await uploadToS3({
      bucket: process.env.S3_BUCKET_NAME!,
      key: s3Key,
      body: audioFile.buffer,
      contentType: audioFile.mimetype,
    });

    const paymentData: any = {};

    if (paymentMethod && paymentContactInfo) {
      switch (paymentMethod) {
        case "paypal":
          paymentData.paypalEmail = paymentContactInfo;
          paymentData.paypalPayoutsEnabled = true;
          break;
        case "wise":
          paymentData.wiseEmail = paymentContactInfo;
          paymentData.wisePayoutsEnabled = true;
          break;
        case "revolut":
          paymentData.revolutEmail = paymentContactInfo;
          paymentData.revolutePayoutsEnabled = true;
          break;
        case "stripe":
          break;
      }
    }

    await prisma.user.update({
      where: { id: user?.id },
      data: {
        name: `${backgroundInfo.firstName} ${backgroundInfo.lastName}`,
        date_of_birth: backgroundInfo.dateOfBirth,
        gender: backgroundInfo.gender,
        race: backgroundInfo.ethnicity,
        area_grown_up: backgroundInfo.areaGrowUp,
        language: backgroundInfo.nativeLanguage,
        city: backgroundInfo.cityOfResidence,
        language_dialect: backgroundInfo.dialect,
        education_level: backgroundInfo.educationLevel,
        language_proficieny: [
          backgroundInfo.languageProficiency.speaking[0],
          backgroundInfo.languageProficiency.reading[0],
          backgroundInfo.languageProficiency.writing[0],
          backgroundInfo.languageProficiency.listening[0],
        ],
        language_use: [...backgroundInfo.languageUsage],
        quiz_answers: [...Object.keys(backgroundInfo.quizAnswers)],
        details_added: true,
        audio_sample_url: audioUrl,
        country: backgroundInfo.country,
        countryCode: backgroundInfo.countryCode,
        state: backgroundInfo.state,
        ...paymentData,
      },
    });

    return res.status(200).json({ success: true, message: "data received" });
  } catch (err) {
    console.log(err);
    if (!res.headersSent) {
      return internalServerError(res);
    }
  } finally {
    await prisma.$disconnect();
  }
};

export const getUserDetails: RequestHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const token = req.cookies.authToken;

    if (!token) {
      return res
        .status(404)
        .json({ success: false, message: "User does not exists" });
    }

    const { username }: { username: string } = jwt_decode(token);

    const user = await prisma.user.findFirst({ where: { username: username } });

    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User does not exists" });
    }

    return res.status(200).json({ success: true, message: user });
  } catch (err) {
    logger.error(`Error in getting user: ${err}`);
    if (!res.headersSent) {
      return internalServerError(res);
    }
  } finally {
    await prisma.$disconnect();
  }
};

export const getUserMeetingsMetaData: RequestHandler = async (
  req: Request,
  res: Response
) => {
  try {
    const token = req.cookies.authToken;

    if (!token) {
      return res
        .status(404)
        .json({ success: false, message: "User does not exists" });
    }

    const { username }: { username: string } = jwt_decode(token);

    const user = await prisma.user.findFirst({ where: { username: username } });

    const userMeetingsWithStats = await prisma.meeting.findMany({
      where: {
        participants: {
          some: {
            userId: user.id,
          },
        },
      },
      include: {
        participants: {
          where: {
            userId: user.id,
          },
          select: {
            role: true,
            dialect: true,
            joinedAt: true,
            leftAt: true,
            duration: true,
          },
        },
        conversations: {
          where: {
            userId: user.id,
            status: "completed",
            flagged_status: false,
          },
          select: {
            id: true,
            duration: true,
            quality: true,
            earnings: true,
            status: true,
            startTime: true,
            endTime: true,
            createdAt: true,
            paidAt: true,
            notes: true,
            paymentStatus: true,
          },
        },
        _count: {
          select: {
            conversations: {
              where: {
                userId: user.id,
              },
            },
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    const meetingsWithStats = userMeetingsWithStats
      .map((meeting) => {
        const conversations = meeting.conversations;

        const totalDuration = conversations.reduce(
          (sum: number, conv: any) => sum + parseFloat(conv.duration),
          0
        );

        const totalEarnings = conversations.reduce(
          (sum: number, conv: any) => sum + parseFloat(conv.earnings),
          0
        );

        const averageQuality =
          conversations.length > 0
            ? conversations.reduce(
                (sum: number, conv: any) => sum + parseFloat(conv.quality),
                0
              ) / conversations.length
            : 0;

        const isPaid = conversations.find(
          (conv) => conv.paymentStatus === "paid"
        );

        return {
          meetingId: meeting.id,
          sessionName: meeting.sessionName,
          language: meeting.language,
          createdAt: meeting.createdAt,
          endedAt: meeting.endedAt,
          isActive: meeting.isActive,
          userRole: meeting.participants[0]?.role,
          userDialect: meeting.participants[0]?.dialect,
          conversationCount: conversations.length,
          totalDuration: totalDuration,
          totalDurationFormatted: `${(totalDuration / 60).toFixed(2)}m`,
          totalEarnings: parseFloat(totalEarnings.toFixed(2)),
          averageQuality: parseFloat(averageQuality.toFixed(2)),
          conversations: conversations,
          isPaid: isPaid !== undefined ? true : false,
          paidAt: isPaid !== undefined ? isPaid.paidAt : null,
        };
      })
      .filter((meeting) => meeting.conversationCount >= 1);

    return res.status(200).json({ success: true, message: meetingsWithStats });
  } catch (err) {
    logger.error(`Error in getting meeting metadata: ${err}`);
    if (!res.headersSent) {
      return internalServerError(res);
    }
  } finally {
    await prisma.$disconnect();
  }
};

export const getUserEearnings: RequestHandler = async (
  req: Request,
  res: Response
) => {
  try {
    const token = req.cookies.authToken;

    if (!token) {
      return res
        .status(404)
        .json({ success: false, message: "User does not exists" });
    }

    const { username }: { username: string } = jwt_decode(token);

    const user = await prisma.user.findFirst({ where: { username: username } });

    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User does not exists" });
    }

    const result = await prisma.conversation.aggregate({
      where: {
        userId: user.id,
        status: "completed",
        flagged_status: false,
      },
      _sum: {
        earnings: true,
      },
    });

    const paidResult = await prisma.conversation.aggregate({
      where: {
        userId: user.id,
        paymentStatus: "paid",
        flagged_status: false,
      },
      _sum: {
        earnings: true,
      },
    });

    const pendingResult = await prisma.conversation.aggregate({
      where: {
        userId: user.id,
        paymentStatus: "unpaid",
        flagged_status: false,
      },
      _sum: {
        earnings: true,
      },
    });

    return res.status(200).json({
      success: true,
      totalEarnings: result._sum.earnings || 0,
      amountPaid: paidResult._sum.earnings || 0,
      amountPending: pendingResult._sum.earnings || 0,
    });
  } catch (err) {
    logger.error(`Error in getting user earnings: ${err}`);
    if (!res.headersSent) {
      return internalServerError(res);
    }
  } finally {
    await prisma.$disconnect();
  }
};

export const addPaypalEmail: RequestHandler = async (
  req: Request,
  res: Response
) => {
  try {
    const { paypalEmail }: { paypalEmail: string } = req.body;

    if (!paypalEmail || !paypalEmail.trim()) {
      return res
        .status(400)
        .json({ success: false, message: "Please provide valid email" });
    }

    if (!validateEmail(paypalEmail)) {
      return res.status(400).json({
        success: false,
        message: "PayPal email is not valid",
      });
    }

    const token = req.cookies.authToken;

    if (!token) {
      return res
        .status(404)
        .json({ success: false, message: "User does not exists" });
    }

    const { username }: { username: string } = jwt_decode(token);

    const user = await prisma.user.findFirst({ where: { username: username } });

    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User does not exists" });
    }

    if (user.wiseEmail || user.revolutEmail || user.stripeAccountId) {
      return res.status(400).json({
        success: false,
        message:
          "You already have a payment method connected. Please remove it first.",
      });
    }

    const existingUser = await prisma.user.findFirst({
      where: {
        paypalEmail: paypalEmail,
        NOT: { username: username },
      },
    });

    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: "This PayPal email is already connected to another account",
      });
    }

    await prisma.user.update({
      where: { username: username },
      data: { paypalEmail: paypalEmail, paypalPayoutsEnabled: true },
    });

    return res.status(200).json({
      success: true,
      message: "PayPal email added successfully",
    });
  } catch (err) {
    logger.error(`Error in adding paypal email: ${err}`);
    if (!res.headersSent) {
      return internalServerError(res);
    }
  } finally {
    await prisma.$disconnect();
  }
};

export const addWiseEmail: RequestHandler = async (
  req: Request,
  res: Response
) => {
  try {
    const { wiseEmail }: { wiseEmail: string } = req.body;

    if (!wiseEmail || !wiseEmail.trim()) {
      return res
        .status(400)
        .json({ success: false, message: "Please provide valid email" });
    }

    if (!validateEmail(wiseEmail)) {
      return res.status(400).json({
        success: false,
        message: "Wise email is not valid",
      });
    }

    const token = req.cookies.authToken;

    if (!token) {
      return res
        .status(404)
        .json({ success: false, message: "User does not exists" });
    }

    const { username }: { username: string } = jwt_decode(token);

    const user = await prisma.user.findFirst({ where: { username: username } });

    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User does not exists" });
    }

    if (user.paypalEmail || user.revolutEmail || user.stripeAccountId) {
      return res.status(400).json({
        success: false,
        message:
          "You already have a payment method connected. Please remove it first.",
      });
    }

    const existingUser = await prisma.user.findFirst({
      where: {
        wiseEmail: wiseEmail,
        NOT: { username: username },
      },
    });

    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: "This Wise email is already connected to another account",
      });
    }

    await prisma.user.update({
      where: { username: username },
      data: { wiseEmail: wiseEmail, wisePayoutsEnabled: true },
    });

    return res.status(200).json({
      success: true,
      message: "Wise email added successfully",
    });
  } catch (err) {
    logger.error(`Error in adding wise email: ${err}`);
    if (!res.headersSent) {
      return internalServerError(res);
    }
  } finally {
    await prisma.$disconnect();
  }
};

export const addRevolutEmail: RequestHandler = async (
  req: Request,
  res: Response
) => {
  try {
    const { revolutEmail }: { revolutEmail: string } = req.body;

    if (!revolutEmail || !revolutEmail.trim()) {
      return res
        .status(400)
        .json({ success: false, message: "Please provide valid email" });
    }

    if (!validateEmail(revolutEmail)) {
      return res.status(400).json({
        success: false,
        message: "Revolut email is not valid",
      });
    }

    const token = req.cookies.authToken;

    if (!token) {
      return res
        .status(404)
        .json({ success: false, message: "User does not exists" });
    }

    const { username }: { username: string } = jwt_decode(token);

    const user = await prisma.user.findFirst({ where: { username: username } });

    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User does not exists" });
    }

    if (user.paypalEmail || user.wiseEmail || user.stripeAccountId) {
      return res.status(400).json({
        success: false,
        message:
          "You already have a payment method connected. Please remove it first.",
      });
    }

    const existingUser = await prisma.user.findFirst({
      where: {
        revolutEmail: revolutEmail,
        NOT: { username: username },
      },
    });

    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: "This Revolut email is already connected to another account",
      });
    }

    await prisma.user.update({
      where: { username: username },
      data: { revolutEmail: revolutEmail, revolutePayoutsEnabled: true },
    });

    return res.status(200).json({
      success: true,
      message: "Revolut email added successfully",
    });
  } catch (err) {
    logger.error(`Error in adding revolut email: ${err}`);
    if (!res.headersSent) {
      return internalServerError(res);
    }
  } finally {
    await prisma.$disconnect();
  }
};

export const getPaymentEmails: RequestHandler = async (
  req: Request,
  res: Response
) => {
  try {
    const token = req.cookies.authToken;

    if (!token) {
      return res
        .status(404)
        .json({ success: false, message: "User does not exists" });
    }

    const { username }: { username: string } = jwt_decode(token);

    const user = await prisma.user.findFirst({
      where: { username: username },
      select: {
        paypalEmail: true,
        wiseEmail: true,
        revolutEmail: true,
      },
    });

    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User does not exists" });
    }

    return res.status(200).json({
      success: true,
      paypalEmail: user.paypalEmail || null,
      wiseEmail: user.wiseEmail || null,
      revolutEmail: user.revolutEmail || null,
    });
  } catch (err) {
    logger.error(`Error in getting payment emails: ${err}`);
    if (!res.headersSent) {
      return internalServerError(res);
    }
  } finally {
    await prisma.$disconnect();
  }
};

export const changePaymentMethod: RequestHandler = async (
  req: Request,
  res: Response
) => {
  try {
    const {
      newMethod,
      email,
    }: { newMethod: "paypal" | "wise" | "revolut"; email: string } = req.body;

    if (!newMethod || !email || !email.trim()) {
      return res.status(400).json({
        success: false,
        message: "Please provide payment method type and email",
      });
    }

    if (!validateEmail(email)) {
      return res.status(400).json({
        success: false,
        message: "Email is not valid",
      });
    }

    const token = req.cookies.authToken;

    if (!token) {
      return res
        .status(404)
        .json({ success: false, message: "User does not exists" });
    }

    const { username }: { username: string } = jwt_decode(token);

    const user = await prisma.user.findFirst({ where: { username: username } });

    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User does not exists" });
    }

    const existingUser = await prisma.user.findFirst({
      where: {
        OR: [
          { paypalEmail: email },
          { wiseEmail: email },
          { revolutEmail: email },
        ],
        NOT: { username: username },
      },
    });

    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: "This email is already connected to another account",
      });
    }

    const updateData: any = {
      paypalEmail: null,
      paypalPayoutsEnabled: false,
      wiseEmail: null,
      wisePayoutsEnabled: false,
      revolutEmail: null,
      revolutePayoutsEnabled: false,
      stripeAccountId: null,
    };

    if (newMethod === "paypal") {
      updateData.paypalEmail = email;
      updateData.paypalPayoutsEnabled = true;
    } else if (newMethod === "wise") {
      updateData.wiseEmail = email;
      updateData.wisePayoutsEnabled = true;
    } else if (newMethod === "revolut") {
      updateData.revolutEmail = email;
      updateData.revolutePayoutsEnabled = true;
    }

    await prisma.user.update({
      where: { username: username },
      data: updateData,
    });

    return res.status(200).json({
      success: true,
      message: `Payment method changed to ${newMethod} successfully`,
    });
  } catch (err) {
    logger.error(`Error in changing payment method: ${err}`);
    if (!res.headersSent) {
      return internalServerError(res);
    }
  } finally {
    await prisma.$disconnect();
  }
};
