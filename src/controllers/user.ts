import { Request, Response, NextFunction, RequestHandler } from "express";
import { internalServerError } from "./errors";
import jwt_decode from "jwt-decode";
import { prisma } from "../config/postgres";
import { logger } from "../utils/logger";
import { RtcTokenBuilder, RtcRole } from "agora-access-token";

const APP_ID: string | undefined = process.env.APP_ID;
const APP_CERTIFICATE: string | undefined = process.env.APP_CERTIFICATE;

interface RtcParams extends Request {
  params: {
    channel: string;
    role: "publisher" | "audience";
    tokentype: "uid" | "userAccount";
    uid: string;
  };
  query: {
    expiry?: string;
    // The simplified endpoint uses these, but they are also part of 'query'
    channel?: string;
    uid?: string;
  };
}

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
  }
};

export const addUserDetails: RequestHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { backgroundInfo, linguisticInfo, quizinfo } = req.body;

    if (!backgroundInfo || !linguisticInfo || !quizinfo) {
      return res
        .status(400)
        .json({ success: false, message: "Please enter valid input" });
    }

    const backgroundRequiredIds = [1, 2, 3, 4, 5, 6, 7, 8, 9];
    const linguisticRequiredIds = [1, 2, 3, 4, 5];
    const quizRequiredIds = [1, 2, 3, 4];

    const backgroundHasAllAnswers = (data: any, requiredIds: Array<number>) => {
      return requiredIds.every((id: number) => {
        const value = data[id];

        if (value === undefined || value === "") return false;

        if (id === 8) {
          if (!Array.isArray(value) || value.length === 0) return false;
          const keys = ["language", "rating"];
          return value.every((item) =>
            keys.every((key) => item[key] !== undefined && item[key] !== "")
          );
        }

        if (id === 9) {
          if (
            typeof value !== "object" ||
            Array.isArray(value) ||
            value === null
          )
            return false;
          const keys = ["city", "years"];
          return keys.every(
            (key) => value[key] !== undefined && value[key] !== ""
          );
        }

        return true;
      });
    };

    const linguisticHasAllAnswers = (data: any, requiredIds: Array<number>) => {
      return requiredIds.every((id: number) => {
        const value = data[id];

        if (value === undefined || value === "") return false;

        if ([4, 5].includes(id)) {
          if (!Array.isArray(value) || value.length === 0) return false;

          if (value.length != 4) return false;

          return value.every((item) => item !== undefined && item !== "");
        }

        return true;
      });
    };

    const quizHasAllAnswers = (data: any, requiredIds: Array<number>) =>
      requiredIds.every(
        (id: number) => data[id] !== undefined && data[id] !== ""
      );

    const isBackgroundComplete = backgroundHasAllAnswers(
      backgroundInfo,
      backgroundRequiredIds
    );

    const isLinguisticComplete = linguisticHasAllAnswers(
      linguisticInfo,
      linguisticRequiredIds
    );

    const isQuizComplete = quizHasAllAnswers(quizinfo, quizRequiredIds);

    if (!isBackgroundComplete || !isLinguisticComplete || !isQuizComplete) {
      return res
        .status(400)
        .json({ success: false, message: "Please enter valid input" });
    }

    const token = req.cookies.authToken;

    const { username }: { username: string } = jwt_decode(token);

    const user = await prisma.user.findFirst({ where: { username: username } });

    const languages = backgroundInfo["8"].map((item: any) => item.language);
    const language_ratings = backgroundInfo["8"].map(
      (item: any) => item.rating
    );

    await prisma.user.update({
      where: { id: user?.id },
      data: {
        date_of_birth: backgroundInfo["3"],
        gender: backgroundInfo["4"],
        race: backgroundInfo["5"],
        area_grown_up: backgroundInfo["6"],
        hear_about_us: backgroundInfo["7"],
        languages: languages,
        languages_rating: language_ratings,
        city: backgroundInfo["9"].city,
        year_in_city: parseInt(backgroundInfo["9"].years),
        language_apply_for: linguisticInfo["1"],
        language_dialect: linguisticInfo["2"],
        education_level: linguisticInfo["3"],
        language_proficieny: linguisticInfo["4"],
        language_use: linguisticInfo["5"],
        quiz_answers: [
          quizinfo["1"],
          quizinfo["2"],
          quizinfo["3"],
          quizinfo["4"],
        ],
        details_added: true,
      },
    });

    return res.status(200).json({ success: true, message: "data received" });
  } catch (err) {
    console.log(err);
    if (!res.headersSent) {
      return internalServerError(res);
    }
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

export const getAgoraToken: RequestHandler = async (
  req: RtcParams,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!APP_ID || !APP_CERTIFICATE) {
      return res.status(500).json({
        success: false,
        message: "Agora credentials not configured in environment variables",
      });
    }

    const {
      channel: channelName,
      role: roleStr,
      tokentype,
      uid: uidStr,
    } = req.params;

    if (!channelName) {
      return res.status(400).json({ error: "Channel name is required" });
    }

    let role: number;
    if (roleStr === "publisher") {
      role = RtcRole.PUBLISHER;
    } else if (roleStr === "audience") {
      role = RtcRole.SUBSCRIBER;
    } else {
      return res.status(400).json({
        error: 'Invalid role. Use "publisher" or "audience"',
      });
    }

    let expirationTimeInSeconds: number = 3600;
    if (req.query.expiry) {
      const customExpiry = parseInt(req.query.expiry, 10);
      if (!isNaN(customExpiry)) {
        expirationTimeInSeconds = customExpiry;
      }
    }

    const currentTimestamp: number = Math.floor(Date.now() / 1000);
    const privilegeExpiredTs: number =
      currentTimestamp + expirationTimeInSeconds;

    let token: string;

    if (tokentype === "userAccount") {
      token = RtcTokenBuilder.buildTokenWithAccount(
        APP_ID,
        APP_CERTIFICATE,
        channelName,
        uidStr,
        role,
        privilegeExpiredTs
      );
    } else if (tokentype === "uid") {
      const uid: number = uidStr === "0" ? 0 : parseInt(uidStr, 10);

      if (isNaN(uid)) {
        return res.status(400).json({
          error: "Invalid UID. Must be a number",
        });
      }

      token = RtcTokenBuilder.buildTokenWithUid(
        APP_ID,
        APP_CERTIFICATE,
        channelName,
        uid,
        role,
        privilegeExpiredTs
      );
    } else {
      return res.status(400).json({
        error: 'Invalid tokentype. Use "uid" or "userAccount"',
      });
    }

    const user_token = req.cookies.authToken;

    if (!user_token) {
      return res
        .status(404)
        .json({ success: false, message: "User does not exists" });
    }

    const { username }: { username: string } = jwt_decode(user_token);

    const user = await prisma.user.findFirst({ where: { username: username } });

    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User does not exists" });
    }

    const check_meetings = await prisma.user.findFirst({
      where: {
        username: user.username,
        channels: {
          has: channelName,
        },
      },
    });

    if (!check_meetings) {
      await prisma.user.update({
        where: { id: user?.id },
        data: {
          channels: [...user.channels, channelName],
          meetings_attended: user.meetings_attended + 1,
        },
      });
    }

    return res.status(200).json({
      rtcToken: token,
      appId: APP_ID,
      channel: channelName,
      uid: uidStr,
      expiresIn: expirationTimeInSeconds,
    });
  } catch (err) {
    logger.error(`Error in getting user: ${err}`);
    if (!res.headersSent) {
      return internalServerError(res);
    }
  } finally {
    await prisma.$disconnect();
  }
};
