import { prisma } from "../config/postgres";
import { Request, Response, RequestHandler } from "express";
import { internalServerError, badRequestResponse } from "./errors";
import { logger } from "../utils/logger";
import jwt_decode from "jwt-decode";
import { stripe } from "../config/stripe";

export const createConnectAccount: RequestHandler = async (
  req: Request,
  res: Response
) => {
  try {
    const cookietoken = req.cookies.authToken;

    const { username }: { username: string } = jwt_decode(cookietoken);

    const user = await prisma.user.findFirst({ where: { username: username } });

    if (user.stripeAccountId) {
      if (!user.stripeOnboardingComplete) {
        const accountLink = await stripe.accountLinks.create({
          account: user.stripeAccountId,
          refresh_url: `${process.env.FRONTEND_URL}/earnings?refresh=true`,
          return_url: `${process.env.FRONTEND_URL}/earnings?success=true`,
          type: "account_onboarding",
        });

        return res.status(200).json({
          success: true,
          url: accountLink.url,
          accountId: user.stripeAccountId,
        });
      } else {
        return badRequestResponse(res, "Stripe onboarding already completed.");
      }
    }

    let account = null;

    if (user.countryCode === "US") {
      account = await stripe.accounts.create({
        type: "express",
        country: user.countryCode,
        email: user.email,
        capabilities: {
          transfers: { requested: true },
        },
        business_type: "individual",
        metadata: {
          userId: user.id,
          platform: "Sunain",
        },
      });
    } else {
      account = await stripe.accounts.create({
        type: "express",
        country: user.countryCode,
        email: user.email,
        capabilities: {
          transfers: { requested: true },
        },
        business_type: "individual",
        metadata: {
          userId: user.id,
          platform: "Sunain",
        },
        tos_acceptance: {
          service_agreement: "recipient",
        },
      });
    }

    if (!account) {
      return res.status(400).json({
        success: false,
        message: "sorry account could not be created",
      });
    }

    await prisma.user.update({
      where: { id: user.id },
      data: {
        stripeAccountId: account.id,
      },
    });

    const accountLink = await stripe.accountLinks.create({
      account: account.id,
      refresh_url: `${process.env.FRONTEND_URL}/earnings?refresh=true`,
      return_url: `${process.env.FRONTEND_URL}/earnings?success=true`,
      type: "account_onboarding",
    });

    return res.status(200).json({
      success: true,
      url: accountLink.url,
      accountId: account.id,
    });
  } catch (err) {
    logger.error(`Error in creating connect account: ${err}`);
    if (!res.headersSent) {
      return internalServerError(res);
    }
  } finally {
    await prisma.$disconnect();
  }
};

export const checkAccountStatus: RequestHandler = async (
  req: Request,
  res: Response
) => {
  try {
    const cookietoken = req.cookies.authToken;

    const { username }: { username: string } = jwt_decode(cookietoken);

    const getUser = await prisma.user.findFirst({
      where: { username: username },
    });

    const user = await prisma.user.findUnique({
      where: { id: getUser.id },
      select: {
        stripeAccountId: true,
        stripeOnboardingComplete: true,
        stripeDetailsSubmitted: true,
        stripeChargesEnabled: true,
        stripePayoutsEnabled: true,
      },
    });

    if (!user.stripeAccountId) {
      return res.status(400).json({
        hasAccount: false,
        onboardingComplete: false,
      });
    }

    const account = await stripe.accounts.retrieve(user.stripeAccountId);

    await prisma.user.update({
      where: { id: getUser.id },
      data: {
        stripeDetailsSubmitted: account.details_submitted,
        stripeChargesEnabled: account.charges_enabled,
        stripePayoutsEnabled: account.payouts_enabled,
        stripeOnboardingComplete:
          account.details_submitted && account.payouts_enabled,
      },
    });

    return res.status(200).json({
      hasAccount: true,
      accountId: account.id,
      onboardingComplete: account.details_submitted && account.payouts_enabled,
      detailsSubmitted: account.details_submitted,
      chargesEnabled: account.charges_enabled,
      payoutsEnabled: account.payouts_enabled,
      requiresAction: !account.details_submitted || !account.payouts_enabled,
    });
  } catch (err) {
    logger.error(`Error in checking account status: ${err}`);
    if (!res.headersSent) {
      return internalServerError(res);
    }
  } finally {
    await prisma.$disconnect();
  }
};

export const refreshOnBoardingLink: RequestHandler = async (
  req: Request,
  res: Response
) => {
  try {
    const cookietoken = req.cookies.authToken;

    const { username }: { username: string } = jwt_decode(cookietoken);

    const user = await prisma.user.findFirst({
      where: { username: username },
    });

    if (!user.stripeAccountId) {
      return res.status(400).json({
        success: false,
        message: "No Stripe account found",
      });
    }

    const accountLink = await stripe.accountLinks.create({
      account: user.stripeAccountId,
      refresh_url: `${process.env.FRONTEND_URL}/earnings?refresh=true`,
      return_url: `${process.env.FRONTEND_URL}/earnings?success=true`,
      type: "account_onboarding",
    });

    return res.status(200).json({
      success: true,
      url: accountLink.url,
    });
  } catch (err) {
    logger.error(`Erros in refreshing onboarding link: ${err}`);
    if (!res.headersSent) {
      return internalServerError(res);
    }
  } finally {
    await prisma.$disconnect();
  }
};

export const handleWebhook = async (req: Request, res: Response) => {
  try {
    const sig = req.headers["stripe-signature"] as string;
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    let event;

    event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);

    switch (event.type) {
      case "account.updated":
        await handleAccountUpdated(event.data.object);
        break;

      case "account.application.deauthorized":
        await handleAccountDeauthorized(event.data.object);
        break;

      default:
        console.log(`Unhandled event type ${event.type}`);
    }

    return res.status(200).json({ received: true });
  } catch (err) {
    logger.error(`Webhook signature verification failed: ${err}`);
    if (!res.headersSent) {
      return internalServerError(res);
    }
  } finally {
    await prisma.$disconnect();
  }
};

export const getDashboardLink = async (req: Request, res: Response) => {
  try {
    const cookietoken = req.cookies.authToken;

    const { username }: { username: string } = jwt_decode(cookietoken);

    const user = await prisma.user.findFirst({
      where: { username: username },
    });

    if (!user.stripeAccountId) {
      return res.status(400).json({
        success: false,
        error: "No Stripe account found",
      });
    }

    // Create login link for Express Dashboard
    const loginLink = await stripe.accounts.createLoginLink(
      user.stripeAccountId
    );

    return res.status(200).json({ success: true, message: loginLink });
  } catch (err) {
    logger.error(`Erros in refreshing onboarding link: ${err}`);
    if (!res.headersSent) {
      return internalServerError(res);
    }
  } finally {
    await prisma.$disconnect();
  }
};

const handleAccountUpdated = async (account: any) => {
  try {
    const user = await prisma.user.findUnique({
      where: { stripeAccountId: account.id },
    });

    if (!user) {
      console.error("User not found for account:", account.id);
      return;
    }

    await prisma.user.update({
      where: { id: user.id },
      data: {
        stripeDetailsSubmitted: account.details_submitted,
        stripeChargesEnabled: account.charges_enabled,
        stripePayoutsEnabled: account.payouts_enabled,
        stripeOnboardingComplete:
          account.details_submitted && account.payouts_enabled,
      },
    });

    console.log("✅ Updated Stripe status for user:", user.email);
  } catch (error) {
    console.error("Error handling account update:", error);
  }
};

const handleAccountDeauthorized = async (account: any) => {
  try {
    await prisma.user.update({
      where: { stripeAccountId: account.id },
      data: {
        stripeAccountId: null,
        stripeOnboardingComplete: false,
        stripeDetailsSubmitted: false,
        stripeChargesEnabled: false,
        stripePayoutsEnabled: false,
      },
    });

    console.log("✅ Account deauthorized:", account.id);
  } catch (error) {
    console.error("Error handling account deauthorization:", error);
  }
};
