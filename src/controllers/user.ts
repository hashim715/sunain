import { Request, Response, NextFunction, RequestHandler } from "express";
import { internalServerError } from "./errors";
import jwt_decode from "jwt-decode";
import { prisma } from "../config/postgres";
import { logger } from "../utils/logger";
import { uploadToS3 } from "../utils/uploadToS3";

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
    let { backgroundInfo } = req.body;

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
      bucket: process.env.AWS_S3_BUCKET!,
      key: s3Key,
      body: audioFile.buffer,
      contentType: audioFile.mimetype,
    });

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
