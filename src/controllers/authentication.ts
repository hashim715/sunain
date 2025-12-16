import { prisma } from "../config/postgres";
import { Request, Response, NextFunction, RequestHandler } from "express";
import jwt_decode from "jwt-decode";
import { v4 as uuidv4 } from "uuid";
import dotenv from "dotenv";
import axios from "axios";
import { sendTokenCookie } from "../utils/sendTokenCookie";
import { internalServerError, badRequestResponse } from "./errors";
import { logger } from "../utils/logger";
import { generateVerificationCode } from "../utils/getVerificationCode";
import { twilio_client } from "../utils/twilioClient";
import { validatePhoneNumber } from "../utils/validatePhoneNumber";
import crypto from "crypto";
import { validateEmail } from "../utils/checkvalidEmail";
import { email_transporter } from "../utils/sendEmail";
import bcrypt from "bcrypt";

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
        OR: [{ email: userInfoResponse.data.emailAddresses[0].value }],
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

      return res.status(200).json({
        success: true,
        message: "Logged in successfully",
        details_added: user.details_added,
        verified: user.verified,
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
        username: username,
        google_login: true,
        google_access_token: access_token,
        google_refresh_token: refresh_token,
        google_token_expiry: expiryDate.toISOString(),
        email_verified: true,
      },
    });

    await sendTokenCookie(res, username);

    return res.status(201).json({
      success: true,
      message: "Logged in successfully",
      details_added: false,
      verified: false,
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

export const register: RequestHandler = async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res
        .status(400)
        .json({ success: false, message: "Please provide valid inputs" });
    }
    console.log(email, password);

    if (!validateEmail(email)) {
      return res.status(400).json({
        success: false,
        message: "Email that you provided is not valid",
      });
    }

    let user = await prisma.user.findFirst({
      where: { email: email },
    });

    if (user) {
      return res.status(400).json({
        success: false,
        message: "User with that email already exists",
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

    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    const { verificationToken, token, code } = generateVerificationCode();

    const currentDate = new Date();
    const next2Minutes = new Date(currentDate.getTime() + 2 * 60 * 1000);

    console.log(code);

    // const mailOptions = {
    //   from: process.env.EMAIL_FROM,
    //   to: email,
    //   subject: "Hello from CourseX",
    //   text: "Verify your Email",
    //   html: `<h1>Your verification code is: ${code}</h1></br><p>Click on the link given below:<a>https://coursex.us/app/verification/${email}/verify</a></p>`,
    // };

    // await email_transporter.sendMail(mailOptions);

    user = await prisma.user.create({
      data: {
        email: email,
        username: username,
        verification_token_email: verificationToken,
        verification_secret_email: token,
        verification_token_expiry_email: next2Minutes.toISOString(),
        password: hashedPassword,
      },
    });

    return res.status(201).json({
      success: true,
      message: "User registered successfully",
      details_added: user.details_added,
      verified: user.verified,
      email_verified: user.email_verified,
    });
  } catch (err) {
    logger.error(`Error in registering the user: ${err}`);
    if (!res.headersSent) {
      return internalServerError(res);
    }
  } finally {
    await prisma.$disconnect();
  }
};

export const login: RequestHandler = async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res
        .status(400)
        .json({ success: false, message: "Please provide valid inputs" });
    }

    if (!validateEmail(email)) {
      return res.status(400).json({
        success: false,
        message: "Email that you provided is not valid",
      });
    }

    let user = await prisma.user.findFirst({
      where: { email: email },
    });

    if (!user) {
      return res.status(400).json({
        success: false,
        message: "User with that email does not exists",
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

    return res.status(201).json({
      success: true,
      message: "Logged in successfully",
      details_added: user.details_added,
      verified: user.verified,
      email_verified: user.email_verified,
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

export const verifyEmail: RequestHandler = async (
  req: Request,
  res: Response
) => {
  try {
    const {
      code,
    }: {
      code: string;
    } = req.body;

    let { email }: { email: string } = req.body;

    if (!code.trim() || !email.trim() || code.length < 6) {
      return res
        .status(400)
        .json({ success: false, message: "Please provide valid inputs" });
    }

    if (!validateEmail(email)) {
      return res.status(400).json({
        success: false,
        message: "Email that you provided is not valid",
      });
    }

    let user = await prisma.user.findFirst({
      where: { email: email },
    });

    if (!user) {
      return res.status(400).json({
        success: false,
        message: "user does not exists with this email",
      });
    }

    if (user.email_verified) {
      return res
        .status(400)
        .json({ success: false, message: "user is already verified" });
    }

    const verification_token = crypto
      .createHash("sha256")
      .update(code + user.verification_secret_email)
      .digest("hex");

    if (user.verification_token_email !== verification_token) {
      return res
        .status(400)
        .json({ success: false, message: "Code did not match" });
    }

    if (Date.now() > new Date(user.verification_token_expiry_email).getTime()) {
      await prisma.user.update({
        where: { email: email },
        data: {
          verification_secret_email: null,
          verification_token_email: null,
          verification_token_expiry_email: null,
        },
      });
      return res.status(400).json({
        success: false,
        message:
          "Your verification token is expired not valid try resending the code",
      });
    }

    await prisma.user.update({
      where: { email: email },
      data: {
        email_verified: true,
        verification_secret_email: null,
        verification_token_email: null,
        verification_token_expiry_email: null,
        details_added: user.details_added,
      },
    });

    return res
      .status(200)
      .json({ success: true, message: "Verified User successfully" });
  } catch (err) {
    logger.error(`Error in verifying the email: ${err}`);
    if (!res.headersSent) {
      return internalServerError(res);
    }
  } finally {
    await prisma.$disconnect();
  }
};

export const resendCodeToEmail: RequestHandler = async (
  req: Request,
  res: Response
) => {
  try {
    let { email }: { email: string } = req.body;

    if (!email.trim()) {
      return res
        .status(400)
        .json({ success: false, message: "Please provide valid inputs" });
    }

    if (!validateEmail(email)) {
      return res.status(400).json({
        success: false,
        message: "Email that you provided is not valid",
      });
    }

    const user = await prisma.user.findFirst({ where: { email: email } });

    if (user.email_verified) {
      return res.status(400).json({
        success: false,
        message: "user is already verified",
      });
    }

    if (user.verification_token_expiry_email) {
      const now = new Date();
      const expiry = new Date(user.verification_token_expiry_email);

      if (now < expiry) {
        const remainingSeconds = Math.ceil(
          (expiry.getTime() - now.getTime()) / 1000
        );

        return res.status(400).json({
          success: false,
          message: `A verification code is already sent. Try again after ${remainingSeconds} seconds.`,
        });
      }
    }

    const { verificationToken, token, code } = generateVerificationCode();

    const currentDate = new Date();
    const next2Minutes = new Date(currentDate.getTime() + 2 * 60 * 1000);

    console.log(code);

    // const mailOptions = {
    //   from: process.env.EMAIL_FROM,
    //   to: email,
    //   subject: "Hello from CourseX",
    //   text: "Verify your Email",
    //   html: `<h1>Your verification code is: ${code}</h1></br><p>Click on the link given below:<a>https://coursex.us/app/verification/${email}/verify</a></p>`,
    // };

    // await email_transporter.sendMail(mailOptions);

    await prisma.user.update({
      where: { email: email },
      data: {
        verification_secret_email: token,
        verification_token_email: verificationToken,
        verification_token_expiry_email: next2Minutes.toISOString(),
      },
    });

    return res
      .status(200)
      .json({ success: true, message: "Verification code sent successfully" });
  } catch (err) {
    logger.error(`Error in sending the verification code: ${err}`);
    if (!res.headersSent) {
      return internalServerError(res);
    }
  } finally {
    await prisma.$disconnect();
  }
};

export const changePhoneNumber: RequestHandler = async (
  req: Request,
  res: Response
) => {
  try {
    const { password }: { password: string } = req.body;

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
  } catch (err) {
    logger.error(`Error in getting user: ${err}`);
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

export const verifyPhoneNumberOnLogin: RequestHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const {
      code,
    }: {
      code: string;
    } = req.body;

    let { phone_number }: { phone_number: string } = req.body;

    if (!code.trim() || !phone_number.trim() || code.length < 6) {
      return res
        .status(400)
        .json({ success: false, message: "Please provide valid inputs" });
    }

    if (!validatePhoneNumber(phone_number)) {
      return res.status(400).json({
        success: false,
        message: "Phone number that you provided is not valid",
      });
    }

    let user = await prisma.user.findFirst({
      where: { phone_number: phone_number },
    });

    if (!user) {
      return res
        .status(400)
        .json({ success: false, message: "You are not registered" });
    }

    if (user.verified) {
      return res
        .status(400)
        .json({ success: false, message: "user is already verified" });
    }

    const verification_token = crypto
      .createHash("sha256")
      .update(code + user.verification_secret)
      .digest("hex");

    if (user.verification_token !== verification_token) {
      return res
        .status(400)
        .json({ success: false, message: "Code did not match" });
    }

    if (Date.now() > new Date(user.verification_token_expiry).getTime()) {
      await prisma.user.update({
        where: { phone_number: phone_number },
        data: {
          verification_secret: null,
          verification_token: null,
          verification_token_expiry: null,
        },
      });
      return res.status(400).json({
        success: false,
        message: "Your verification token is expired not valid",
      });
    }

    await prisma.user.update({
      where: { phone_number: phone_number },
      data: {
        verified: true,
        verification_secret: null,
        verification_token: null,
        verification_token_expiry: null,
        details_added: user.details_added,
      },
    });

    return res
      .status(200)
      .json({ success: true, message: "Verified User successfully" });
  } catch (err) {
    logger.error(`Error in verifying the phone number: ${err}`);
    if (!res.headersSent) {
      return internalServerError(res);
    }
  } finally {
    await prisma.$disconnect();
  }
};

export const sendVerificationCodeToPhoneNumber: RequestHandler = async (
  req,
  res,
  next
) => {
  try {
    let { phone_number }: { phone_number: string } = req.body;

    if (!phone_number.trim()) {
      return res
        .status(400)
        .json({ success: false, message: "Please provide valid inputs" });
    }

    if (!validatePhoneNumber(phone_number)) {
      return res.status(400).json({
        success: false,
        message: "Phone number that you provided is not valid",
      });
    }

    const cookietoken = req.cookies.authToken;
    const { username }: { username: string } = jwt_decode(cookietoken);

    const user = await prisma.user.findFirst({ where: { username } });

    if (user.verified) {
      return res.status(400).json({
        success: false,
        message: "user is already verified",
      });
    }

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    if (
      !user.sms_attempts_reset_at ||
      new Date(user.sms_attempts_reset_at) < todayStart
    ) {
      await prisma.user.update({
        where: { username },
        data: {
          sms_attempts_today: 0,
          sms_attempts_reset_at: todayStart.toISOString(),
        },
      });
    }

    if (user.sms_attempts_today >= 5) {
      return res.status(429).json({
        success: false,
        message:
          "Too many verification attempts today. Please try again tomorrow.",
      });
    }

    if (user.verification_token_expiry) {
      const now = new Date();
      const expiry = new Date(user.verification_token_expiry);

      if (now < expiry) {
        const remainingSeconds = Math.ceil(
          (expiry.getTime() - now.getTime()) / 1000
        );

        return res.status(400).json({
          success: false,
          message: `A verification code is already sent. Try again after ${remainingSeconds} seconds.`,
        });
      }
    }

    const { verificationToken, token, code } = generateVerificationCode();

    const currentDate = new Date();
    const next2Minutes = new Date(currentDate.getTime() + 2 * 60 * 1000);

    await twilio_client.messages.create({
      body: `Your Sunain code is ${code}`,
      from: process.env.TWILIO_ACCOUNT_PHONE_NUMBER,
      to: phone_number,
    });

    await prisma.user.update({
      where: { username },
      data: {
        verification_secret: token,
        verification_token: verificationToken,
        verification_token_expiry: next2Minutes.toISOString(),
        phone_number: phone_number,
        sms_attempts_today: user.sms_attempts_today + 1,
      },
    });

    return res
      .status(200)
      .json({ success: true, message: "Message sent successfully" });
  } catch (err) {
    logger.error(`Error in sending the verification code: ${err}`);
    if (!res.headersSent) {
      return internalServerError(res);
    }
  } finally {
    await prisma.$disconnect();
  }
};
