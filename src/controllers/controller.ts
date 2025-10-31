import { Request, Response, NextFunction, RequestHandler } from "express";
import dotenv from "dotenv";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { s3 } from "../config/aws_s3";

dotenv.config();

export const getSignedUrlFromS3: RequestHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const fileName = String(req.query.fileName);
    const contentType = String(req.query.contentType);
    const roomId = String(req.query.roomId || "default");

    if (!fileName || !contentType)
      return res.status(400).json({ error: "Missing fileName or contentType" });

    const command = new PutObjectCommand({
      Bucket: process.env.S3_BUCKET_NAME!,
      Key: `${roomId}/${fileName}`,
      ContentType: contentType,
    });

    const signedUrl = await getSignedUrl(s3, command, { expiresIn: 120 });

    return res.status(200).json({
      uploadUrl: signedUrl,
    });
  } catch (err) {
    console.log(err);
    if (!res.headersSent) {
      return res
        .status(500)
        .json({ success: false, message: "Something went wrong" });
    }
  }
};
