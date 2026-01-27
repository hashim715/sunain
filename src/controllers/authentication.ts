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
import { validateAndNormalizePhoneNumber } from "../utils/validatePhoneNumber";
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

    const verifyUrl = `https://sunain.com/verify-email/${encodeURIComponent(
      email
    )}/`;

    // const mailOptions = {
    //   from: process.env.GOOGLE_APP_EMAIL_FROM,
    //   to: email,
    //   subject: "Verify your email — Sunain",
    //   text: `Verify your email for Sunain

    // Your verification code:
    // ${code}

    // Or verify here:
    // ${verifyUrl}

    // If you didn’t create a Sunain account, you can safely ignore this email.`,
    //   html: `
    //   <div style="margin:0;padding:0;background:#f5f5f7;">
    //     <!-- Preheader -->
    //     <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">
    //       Your Sunain verification code is ${String(code)}.
    //     </div>

    //     <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f5f5f7;padding:40px 0;">
    //       <tr>
    //         <td align="center" style="padding:0 16px;">
    //           <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;">
    //             <!-- Brand -->
    //             <tr>
    //               <td align="center" style="padding:10px 8px 18px 8px;">
    //                 <div style="font-family:Helvetica,Arial,sans-serif;font-size:13px;letter-spacing:0.6px;color:#6e6e73;">
    //                   SUNAIN
    //                 </div>
    //               </td>
    //             </tr>

    //             <!-- Card -->
    //             <tr>
    //               <td style="background:#ffffff;border:1px solid #e5e5ea;border-radius:18px;box-shadow:0 10px 30px rgba(0,0,0,0.07);">
    //                 <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
    //                   <tr>
    //                     <td style="padding:30px 26px 26px 26px;font-family:Helvetica,Arial,sans-serif;">
    //                       <div style="font-size:24px;line-height:1.25;font-weight:700;color:#1d1d1f;margin:0 0 10px 0;">
    //                         Verify your email
    //                       </div>

    //                       <div style="font-size:15px;line-height:1.65;color:#1d1d1f;margin:0 0 18px 0;">
    //                         Welcome to Sunain. Confirming your email keeps your account secure and ensures you can receive important updates.
    //                       </div>

    //                       <!-- Code -->
    //                       <div style="text-align:center;margin:18px 0 10px 0;">
    //                         <div style="display:inline-block;background:#f5f5f7;border:1px solid #e5e5ea;border-radius:16px;padding:16px 18px;">
    //                           <span style="font-family:Helvetica,Arial,sans-serif;font-size:28px;letter-spacing:8px;font-weight:700;color:#111111;">
    //                             ${String(code)}
    //                           </span>
    //                         </div>
    //                       </div>

    //                       <div style="font-size:13px;line-height:1.55;color:#6e6e73;text-align:center;margin:0 0 22px 0;">
    //                         This code expires soon for your security.
    //                       </div>

    //                       <!-- Button -->
    //                       <div style="text-align:center;margin:0 0 18px 0;">
    //                         <!--[if mso]>
    //                           <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" href="${verifyUrl}" style="height:44px;v-text-anchor:middle;width:210px;" arcsize="28%" stroke="f" fillcolor="#FF0558">
    //                             <w:anchorlock/>
    //                             <center style="color:#ffffff;font-family:Helvetica,Arial,sans-serif;font-size:15px;font-weight:700;">
    //                               Verify email
    //                             </center>
    //                           </v:roundrect>
    //                         <![endif]-->
    //                         <!--[if !mso]><!-- -->
    //                           <a href="${verifyUrl}"
    //                             style="display:inline-block;background:#FF0558;color:#ffffff;text-decoration:none;padding:14px 22px;border-radius:14px;font-family:Helvetica,Arial,sans-serif;font-size:15px;font-weight:700;line-height:1;">
    //                             Verify email
    //                           </a>
    //                         <!--<![endif]-->
    //                       </div>

    //                       <!-- Fallback link -->
    //                       <div style="font-size:12px;line-height:1.6;color:#6e6e73;margin:0;">
    //                         If the button doesn’t work, copy and paste this link into your browser:
    //                         <br>
    //                         <a href="${verifyUrl}" style="color:#007aff;text-decoration:none;word-break:break-all;">
    //                           ${verifyUrl}
    //                         </a>
    //                       </div>

    //                       <hr style="border:none;border-top:1px solid #e5e5ea;margin:22px 0;">

    //                       <div style="font-size:12px;line-height:1.55;color:#8e8e93;margin:0;">
    //                         If you didn’t request this, no action is required. You can safely ignore this email.
    //                       </div>
    //                     </td>
    //                   </tr>
    //                 </table>
    //               </td>
    //             </tr>

    //             <!-- Footer -->
    //             <tr>
    //               <td align="center" style="padding:16px 8px 0 8px;">
    //                 <div style="font-family:Helvetica,Arial,sans-serif;font-size:11px;line-height:1.5;color:#8e8e93;">
    //                   © ${new Date().getFullYear()} Sunain. All rights reserved.
    //                 </div>
    //               </td>
    //             </tr>

    //           </table>
    //         </td>
    //       </tr>
    //     </table>
    //   </div>
    //   `,
    // };

    const mailOptions = {
      from: process.env.GOOGLE_APP_EMAIL_FROM,
      to: email,
      subject: "Verify your email — Sunain",

      text: `Verify your email for Sunain
    
    Your verification code:
    ${code}
    
    If you didn’t create a Sunain account, you can safely ignore this email.`,

      html: `
      <div style="margin:0;padding:0;background:#f5f5f7;font-family:Arial,sans-serif;">
        <!-- Preheader -->
        <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">
          Your Sunain verification code is ${String(code)}.
        </div>
    
        <div style="max-width:600px;margin:0 auto;padding:24px;background:#ffffff;border-radius:8px;">
          <h2 style="margin-top:0;">Verify your email for Sunain</h2>
    
          <p>Your verification code:</p>
    
          <div style="font-size:24px;font-weight:bold;letter-spacing:4px;margin:16px 0;">
            ${code}
          </div>
    
          <p style="color:#666;">
            If you didn’t create a Sunain account, you can safely ignore this email.
          </p>
        </div>
      </div>
      `,
    };

    await email_transporter.sendMail(mailOptions);

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
      return res.status(404).json({
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

    if (user.is_annotator) {
      return res.status(403).json({
        success: false,
        message: "Annotators are not allowed to login here",
      });
    }

    await sendTokenCookie(res, user.username);

    return res.status(200).json({
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

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User with that email does not exist",
      });
    }

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

    const verifyUrl = `https://sunain.com/verify-email/${encodeURIComponent(
      email
    )}/`;

    // const mailOptions = {
    //   from: process.env.GOOGLE_APP_EMAIL_FROM,
    //   to: email,
    //   subject: "Verify your email — Sunain",
    //   text: `Verify your email for Sunain

    // Your verification code:
    // ${code}

    // Or verify here:
    // ${verifyUrl}

    // If you didn’t create a Sunain account, you can safely ignore this email.`,
    //   html: `
    //   <div style="margin:0;padding:0;background:#f5f5f7;">
    //     <!-- Preheader -->
    //     <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">
    //       Your Sunain verification code is ${String(code)}.
    //     </div>

    //     <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f5f5f7;padding:40px 0;">
    //       <tr>
    //         <td align="center" style="padding:0 16px;">
    //           <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;">
    //             <!-- Brand -->
    //             <tr>
    //               <td align="center" style="padding:10px 8px 18px 8px;">
    //                 <div style="font-family:Helvetica,Arial,sans-serif;font-size:13px;letter-spacing:0.6px;color:#6e6e73;">
    //                   SUNAIN
    //                 </div>
    //               </td>
    //             </tr>

    //             <!-- Card -->
    //             <tr>
    //               <td style="background:#ffffff;border:1px solid #e5e5ea;border-radius:18px;box-shadow:0 10px 30px rgba(0,0,0,0.07);">
    //                 <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
    //                   <tr>
    //                     <td style="padding:30px 26px 26px 26px;font-family:Helvetica,Arial,sans-serif;">
    //                       <div style="font-size:24px;line-height:1.25;font-weight:700;color:#1d1d1f;margin:0 0 10px 0;">
    //                         Verify your email
    //                       </div>

    //                       <div style="font-size:15px;line-height:1.65;color:#1d1d1f;margin:0 0 18px 0;">
    //                         Welcome to Sunain. Confirming your email keeps your account secure and ensures you can receive important updates.
    //                       </div>

    //                       <!-- Code -->
    //                       <div style="text-align:center;margin:18px 0 10px 0;">
    //                         <div style="display:inline-block;background:#f5f5f7;border:1px solid #e5e5ea;border-radius:16px;padding:16px 18px;">
    //                           <span style="font-family:Helvetica,Arial,sans-serif;font-size:28px;letter-spacing:8px;font-weight:700;color:#111111;">
    //                             ${String(code)}
    //                           </span>
    //                         </div>
    //                       </div>

    //                       <div style="font-size:13px;line-height:1.55;color:#6e6e73;text-align:center;margin:0 0 22px 0;">
    //                         This code expires soon for your security.
    //                       </div>

    //                       <!-- Button -->
    //                       <div style="text-align:center;margin:0 0 18px 0;">
    //                         <!--[if mso]>
    //                           <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" href="${verifyUrl}" style="height:44px;v-text-anchor:middle;width:210px;" arcsize="28%" stroke="f" fillcolor="#FF0558">
    //                             <w:anchorlock/>
    //                             <center style="color:#ffffff;font-family:Helvetica,Arial,sans-serif;font-size:15px;font-weight:700;">
    //                               Verify email
    //                             </center>
    //                           </v:roundrect>
    //                         <![endif]-->
    //                         <!--[if !mso]><!-- -->
    //                           <a href="${verifyUrl}"
    //                             style="display:inline-block;background:#FF0558;color:#ffffff;text-decoration:none;padding:14px 22px;border-radius:14px;font-family:Helvetica,Arial,sans-serif;font-size:15px;font-weight:700;line-height:1;">
    //                             Verify email
    //                           </a>
    //                         <!--<![endif]-->
    //                       </div>

    //                       <!-- Fallback link -->
    //                       <div style="font-size:12px;line-height:1.6;color:#6e6e73;margin:0;">
    //                         If the button doesn’t work, copy and paste this link into your browser:
    //                         <br>
    //                         <a href="${verifyUrl}" style="color:#007aff;text-decoration:none;word-break:break-all;">
    //                           ${verifyUrl}
    //                         </a>
    //                       </div>

    //                       <hr style="border:none;border-top:1px solid #e5e5ea;margin:22px 0;">

    //                       <div style="font-size:12px;line-height:1.55;color:#8e8e93;margin:0;">
    //                         If you didn’t request this, no action is required. You can safely ignore this email.
    //                       </div>
    //                     </td>
    //                   </tr>
    //                 </table>
    //               </td>
    //             </tr>

    //             <!-- Footer -->
    //             <tr>
    //               <td align="center" style="padding:16px 8px 0 8px;">
    //                 <div style="font-family:Helvetica,Arial,sans-serif;font-size:11px;line-height:1.5;color:#8e8e93;">
    //                   © ${new Date().getFullYear()} Sunain. All rights reserved.
    //                 </div>
    //               </td>
    //             </tr>

    //           </table>
    //         </td>
    //       </tr>
    //     </table>
    //   </div>
    //   `,
    // };

    const mailOptions = {
      from: process.env.GOOGLE_APP_EMAIL_FROM,
      to: email,
      subject: "Verify your email — Sunain",

      text: `Verify your email for Sunain
    
    Your verification code:
    ${code}
    
    If you didn’t create a Sunain account, you can safely ignore this email.`,

      html: `
      <div style="margin:0;padding:0;background:#f5f5f7;font-family:Arial,sans-serif;">
        <!-- Preheader -->
        <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">
          Your Sunain verification code is ${String(code)}.
        </div>
    
        <div style="max-width:600px;margin:0 auto;padding:24px;background:#ffffff;border-radius:8px;">
          <h2 style="margin-top:0;">Verify your email for Sunain</h2>
    
          <p>Your verification code:</p>
    
          <div style="font-size:24px;font-weight:bold;letter-spacing:4px;margin:16px 0;">
            ${code}
          </div>
    
          <p style="color:#666;">
            If you didn’t create a Sunain account, you can safely ignore this email.
          </p>
        </div>
      </div>
      `,
    };

    await email_transporter.sendMail(mailOptions);

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
    let { phone_number }: { phone_number: string } = req.body;

    if (!phone_number.trim()) {
      return res
        .status(400)
        .json({ success: false, message: "Please provide valid inputs" });
    }

    const { isValid, normalized } =
      validateAndNormalizePhoneNumber(phone_number);

    if (!isValid) {
      return res.status(400).json({
        success: false,
        message: "Phone number that you provided is not valid",
      });
    }

    phone_number = normalized;

    const cookietoken = req.cookies.authToken;
    const { username }: { username: string } = jwt_decode(cookietoken);

    const user = await prisma.user.findFirst({ where: { username } });

    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User does not exists" });
    }

    const checkUser = await prisma.user.findUnique({ where: { phone_number } });

    if (checkUser) {
      return res.status(400).json({
        success: false,
        message: "Phone number is already associated with another account",
      });
    }

    if (!user.verified) {
      return res.status(400).json({
        success: false,
        message: "user is not verified",
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
      body: `Sunain Verification Code: ${code}
    
    Tap to verify your phone:
    https://sunain.com/verify-phone/${encodeURIComponent(phone_number)}
    
    If you didn’t request this, please ignore this message.`,
      from: process.env.TWILIO_ACCOUNT_PHONE_NUMBER,
      to: phone_number,
    });

    await prisma.user.update({
      where: { username },
      data: {
        verification_secret: token,
        verification_token: verificationToken,
        verification_token_expiry: next2Minutes.toISOString(),
        sms_attempts_today: user.sms_attempts_today + 1,
      },
    });

    return res
      .status(200)
      .json({ success: true, message: "Message sent successfully" });
  } catch (err) {
    logger.error(`Error in getting user: ${err}`);
    if (!res.headersSent) {
      return internalServerError(res);
    }
  } finally {
    await prisma.$disconnect();
  }
};

export const verifyChangePhoneNumberCode: RequestHandler = async (
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

    const { isValid, normalized } =
      validateAndNormalizePhoneNumber(phone_number);

    if (!isValid) {
      return res.status(400).json({
        success: false,
        message: "Phone number that you provided is not valid",
      });
    }

    phone_number = normalized;

    const cookietoken = req.cookies.authToken;
    const { username }: { username: string } = jwt_decode(cookietoken);

    const user = await prisma.user.findFirst({ where: { username } });

    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User does not exists" });
    }

    if (!user.verified) {
      return res
        .status(400)
        .json({ success: false, message: "user is not verified" });
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
        where: { username: username },
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
      where: { username: username },
      data: {
        verified: true,
        verification_secret: null,
        verification_token: null,
        verification_token_expiry: null,
        details_added: user.details_added,
        phone_number: phone_number,
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

export const resendVerificationCodeToChangePhoneNumber: RequestHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    let { phone_number }: { phone_number: string } = req.body;

    if (!phone_number.trim()) {
      return res
        .status(400)
        .json({ success: false, message: "Please provide valid inputs" });
    }

    const { isValid, normalized } =
      validateAndNormalizePhoneNumber(phone_number);

    if (!isValid) {
      return res.status(400).json({
        success: false,
        message: "Phone number that you provided is not valid",
      });
    }

    phone_number = normalized;

    const cookietoken = req.cookies.authToken;
    const { username }: { username: string } = jwt_decode(cookietoken);

    const user = await prisma.user.findUnique({
      where: { username, phone_number: phone_number },
    });

    if (!user) {
      return res.status(400).json({
        success: false,
        message: "You are not registered with this phone number",
      });
    }

    if (!user.verified) {
      return res.status(400).json({
        success: false,
        message: "user is not verified",
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
      body: `Sunain Verification Code: ${code}
    
    Tap to verify your phone:
    https://sunain.com/verify-phone/${encodeURIComponent(phone_number)}
    
    If you didn’t request this, please ignore this message.`,
      from: process.env.TWILIO_ACCOUNT_PHONE_NUMBER,
      to: phone_number,
    });

    await prisma.user.update({
      where: { username },
      data: {
        verification_secret: token,
        verification_token: verificationToken,
        verification_token_expiry: next2Minutes.toISOString(),
        sms_attempts_today: user.sms_attempts_today + 1,
      },
    });

    return res
      .status(200)
      .json({ success: true, message: "Message resent successfully" });
  } catch (err) {
    logger.error(`Error in re-sending the verification code: ${err}`);
    if (!res.headersSent) {
      return internalServerError(res);
    }
  } finally {
    await prisma.$disconnect();
  }
};

export const changePassword: RequestHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const {
      oldPassword,
      newPassword,
    }: { oldPassword: string; newPassword: string } = req.body;

    if (!oldPassword || !newPassword) {
      return res
        .status(400)
        .json({ success: false, message: "Please provide valid inputs" });
    }

    const cookietoken = req.cookies.authToken;
    const { username }: { username: string } = jwt_decode(cookietoken);

    const user = await prisma.user.findFirst({ where: { username } });

    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User does not exists" });
    }

    if (
      !user.verified ||
      !user.email_verified ||
      user.google_login ||
      !user.details_added
    ) {
      return res
        .status(400)
        .json({ success: false, message: "user can not change the password" });
    }

    const isValid = await bcrypt.compare(oldPassword, user.password);

    if (!isValid) {
      return res.status(400).json({
        success: false,
        message: "Invalid password",
      });
    }

    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(newPassword, saltRounds);

    await prisma.user.update({
      where: { username: username },
      data: {
        password: hashedPassword,
      },
    });

    return res
      .status(200)
      .json({ success: true, message: "Password changed successfully" });
  } catch (err) {
    logger.error(`Error in changing password: ${err}`);
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

    const { isValid, normalized } =
      validateAndNormalizePhoneNumber(phone_number);

    if (!isValid) {
      return res.status(400).json({
        success: false,
        message: "Phone number that you provided is not valid",
      });
    }

    phone_number = normalized;

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

export const resendVerificationCodeToPhoneNumber: RequestHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    let { phone_number }: { phone_number: string } = req.body;

    if (!phone_number.trim()) {
      return res
        .status(400)
        .json({ success: false, message: "Please provide valid inputs" });
    }

    const { isValid, normalized } =
      validateAndNormalizePhoneNumber(phone_number);

    if (!isValid) {
      return res.status(400).json({
        success: false,
        message: "Phone number that you provided is not valid",
      });
    }

    phone_number = normalized;

    const cookietoken = req.cookies.authToken;
    const { username }: { username: string } = jwt_decode(cookietoken);

    const user = await prisma.user.findUnique({
      where: { username, phone_number: phone_number },
    });

    if (!user) {
      return res.status(400).json({
        success: false,
        message: "You are not registered with this phone number",
      });
    }

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
      body: `Sunain Verification Code: ${code}
    
    Tap to verify your phone:
    https://sunain.com/verify-phone/${encodeURIComponent(phone_number)}
    
    If you didn’t request this, please ignore this message.`,
      from: process.env.TWILIO_ACCOUNT_PHONE_NUMBER,
      to: phone_number,
    });

    await prisma.user.update({
      where: { username },
      data: {
        verification_secret: token,
        verification_token: verificationToken,
        verification_token_expiry: next2Minutes.toISOString(),
        sms_attempts_today: user.sms_attempts_today + 1,
      },
    });

    return res
      .status(200)
      .json({ success: true, message: "Message resent successfully" });
  } catch (err) {
    logger.error(`Error in re-sending the verification code: ${err}`);
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

    const { isValid, normalized } =
      validateAndNormalizePhoneNumber(phone_number);

    if (!isValid) {
      return res.status(400).json({
        success: false,
        message: "Phone number that you provided is not valid",
      });
    }

    phone_number = normalized;

    const cookietoken = req.cookies.authToken;
    const { username }: { username: string } = jwt_decode(cookietoken);

    const checkUser = await prisma.user.findUnique({ where: { phone_number } });

    if (checkUser) {
      return res.status(400).json({
        success: false,
        message: "Phone number is already associated with another account",
      });
    }

    const user = await prisma.user.findUnique({
      where: { username },
    });

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
      body: `Sunain Verification Code: ${code}
    
    Tap to verify your phone:
    https://sunain.com/verify-phone/${encodeURIComponent(phone_number)}
    
    If you didn’t request this, please ignore this message.`,
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
