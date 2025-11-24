import { prisma } from "../config/postgres";
import { Request, Response, NextFunction, RequestHandler } from "express";
import jwt_decode from "jwt-decode";
import { v4 as uuidv4 } from "uuid";
import dotenv from "dotenv";
import axios from "axios";
import { sendTokenCookie } from "../utils/sendTokenCookie";
import { internalServerError, badRequestResponse } from "./errors";
import { logger } from "../utils/logger";

dotenv.config();

const isNonEmptyString = (value: any): boolean => {
  return typeof value === "string" && value.trim().length > 0;
};

export const googleAuth: RequestHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const authUrl =
      `https://accounts.google.com/o/oauth2/v2/auth?` +
      new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID || "",
        redirect_uri: process.env.GOOGLE_REDIRECT_URI || "",
        response_type: "code",
        scope: process.env.GOOGLE_SCOPES || "",
        access_type: "offline",
        prompt: "consent",
      }).toString(); // toString is optional here, but adds clarity

    return res.status(200).json({ success: true, message: authUrl });
  } catch (err) {
    logger.error(`Error in googleAuth: ${err}`);
    if (!res.headersSent) {
      return internalServerError(res);
    }
  } finally {
    await prisma.$disconnect();
  }
};

export const googleredirectauth: RequestHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { code }: { code: string } = req.body;

    if (!isNonEmptyString(code)) {
      return badRequestResponse(res, "Try again something went wrong!");
    }

    const tokenResponse = await axios.post(
      "https://oauth2.googleapis.com/token",
      new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID || "",
        client_secret: process.env.GOOGLE_CLIENT_SECRET || "",
        redirect_uri: process.env.GOOGLE_REDIRECT_URI || "",
        grant_type: "authorization_code",
      }).toString(),
      { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
    );

    const { access_token, refresh_token, expires_in } = tokenResponse.data;

    const expiryDate = new Date(Date.now() + parseInt(expires_in) * 1000);

    const userInfoResponse = await axios.get(
      "https://people.googleapis.com/v1/people/me",
      {
        headers: { Authorization: `Bearer ${access_token}` },
        params: { personFields: "names,emailAddresses" },
      }
    );

    const user = await prisma.user.findFirst({
      where: {
        OR: [
          { email: userInfoResponse.data.emailAddresses[0].value },
          { google_email: userInfoResponse.data.emailAddresses[0].value },
        ],
      },
    });

    if (user) {
      await prisma.user.update({
        where: { email: user.email },
        data: {
          google_access_token: access_token,
          google_refresh_token: refresh_token,
          google_token_expiry: expiryDate.toISOString(),
        },
      });

      await sendTokenCookie(res, user.username);

      return res
        .status(200)
        .json({
          success: true,
          message: "Logged in successfully",
          details_added: user.details_added,
        });
    }

    const uuid = uuidv4();

    const username = uuid;

    const user_ = await prisma.user.findFirst({
      where: { username: username },
    });

    if (user_) {
      return badRequestResponse(res, "Try again something went wrong");
    }

    await prisma.user.create({
      data: {
        email: userInfoResponse.data.emailAddresses[0].value,
        google_email: userInfoResponse.data.emailAddresses[0].value,
        name: userInfoResponse.data.names[0].displayName,
        username: username,
        google_login: true,
        google_access_token: access_token,
        google_refresh_token: refresh_token,
        google_token_expiry: expiryDate.toISOString(),
      },
    });

    await sendTokenCookie(res, username);

    return res
      .status(201)
      .json({
        success: true,
        message: "Logged in successfully",
        details_added: false,
      });
  } catch (err) {
    logger.error(`Error in googleredirectauth: ${err}`);
    if (!res.headersSent) {
      return internalServerError(res);
    }
  } finally {
    await prisma.$disconnect();
  }
};

export const getUser: RequestHandler = async (
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

export const logOut: RequestHandler = async (
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

    await prisma.user.update({
      where: { username: username },
      data: { token: null, expiresAt: null },
    });

    res.clearCookie("authToken", {
      httpOnly: true,
      secure: process.env.ENV === "production" ? true : false,
      sameSite: process.env.ENV === "production" ? "none" : "strict",
    });

    return res
      .status(200)
      .json({ success: true, message: "Logged out successfully" });
  } catch (err) {
    logger.error(`Error in logout: ${err}`);
    if (!res.headersSent) {
      return internalServerError(res);
    }
  } finally {
    await prisma.$disconnect();
  }
};

export const refreshToken: RequestHandler = async (
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

    const user = await prisma.user.findFirst({ where: { token: token } });

    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User does not exists" });
    }

    await sendTokenCookie(res, user.username);

    return res.status(200).json({ success: true, user: user });
  } catch (err) {
    logger.error(`Error in refreshing the token: ${err}`);
    if (!res.headersSent) {
      return internalServerError(res);
    }
  } finally {
    await prisma.$disconnect();
  }
};
