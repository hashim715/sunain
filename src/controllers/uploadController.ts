import { Request, Response, NextFunction, RequestHandler } from "express";
import dotenv from "dotenv";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { s3 } from "../config/aws_s3";
import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs";

dotenv.config();

const sqs = new SQSClient({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

export const getSignedUrlFromS3: RequestHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const fileName = String(req.query.fileName);
    const contentType = String(req.query.contentType);

    if (!fileName || !contentType)
      return res.status(400).json({ error: "Missing fileName or contentType" });

    const command = new PutObjectCommand({
      Bucket: process.env.S3_BUCKET_NAME,
      Key: `${fileName}`,
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

export const sendMessageToSQS: RequestHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { meeting_id, expected_files } = req.body;

    if (!meeting_id || !expected_files) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields: meeting_id or expected_files",
      });
    }

    const command = new SendMessageCommand({
      QueueUrl: process.env.SQS_QUEUE_URL!,
      MessageBody: JSON.stringify({ meeting_id, expected_files }),
    });

    const response = await sqs.send(command);

    return res.status(200).json({
      success: true,
      message: "Message sent successfully to SQS",
      messageId: response.MessageId,
    });
  } catch (err) {
    console.error("❌ Error sending message to SQS:", err);
    if (!res.headersSent) {
      return res
        .status(500)
        .json({ success: false, message: "Something went wrong" });
    }
  }
};
