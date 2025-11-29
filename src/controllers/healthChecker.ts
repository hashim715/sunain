import { Request, Response, NextFunction, RequestHandler } from "express";
import { prisma } from "../config/postgres";
import { S3Client, HeadBucketCommand } from "@aws-sdk/client-s3";
import dotenv from "dotenv";

dotenv.config();

export const healthChecker: RequestHandler = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const healthcheck = {
    uptime: process.uptime(),
    status: "OK",
    timestamp: new Date().toISOString(),
    checks: {
      database: "unknown",
      s3: "unknown",
      memory: "unknown",
    },
  };

  try {
    // 1. Check Database Connection
    try {
      await prisma.$queryRaw`SELECT 1`;
      healthcheck.checks.database = "healthy";
    } catch (dbError) {
      healthcheck.checks.database = "unhealthy";
      healthcheck.status = "DEGRADED";
      console.error("Database health check failed:", dbError);
    }

    // 2. Check S3 Connection (if you're using S3)
    try {
      const s3Client = new S3Client({
        region: process.env.AWS_REGION,
        credentials: {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        },
      });

      await s3Client.send(
        new HeadBucketCommand({
          Bucket: process.env.S3_BUCKET_NAME!,
        })
      );
      healthcheck.checks.s3 = "healthy";
    } catch (s3Error) {
      healthcheck.checks.s3 = "unhealthy";
      healthcheck.status = "DEGRADED";
      console.error("S3 health check failed:", s3Error);
    }

    // 3. Check Memory Usage
    const memUsage = process.memoryUsage();
    const memUsageMB = {
      rss: Math.round(memUsage.rss / 1024 / 1024),
      heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024),
      heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
      external: Math.round(memUsage.external / 1024 / 1024),
    };

    // Alert if heap usage is over 80%
    const heapUsagePercent = (memUsageMB.heapUsed / memUsageMB.heapTotal) * 100;

    if (heapUsagePercent > 80) {
      healthcheck.checks.memory = "warning";
      healthcheck.status = "DEGRADED";
    } else {
      healthcheck.checks.memory = "healthy";
    }

    // Determine HTTP status code
    const statusCode = healthcheck.status === "OK" ? 200 : 503;

    return res.status(statusCode).json({
      ...healthcheck,
      memory: memUsageMB,
      heapUsagePercent: Math.round(heapUsagePercent),
    });
  } catch (err) {
    console.error("Health check failed:", err);

    return res.status(503).json({
      uptime: process.uptime(),
      status: "ERROR",
      timestamp: new Date().toISOString(),
      message: "Health check failed",
      checks: healthcheck.checks,
    });
  }
};
