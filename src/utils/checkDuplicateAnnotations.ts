import { prisma } from "../config/postgres";

async function checkDuplicateAnnotationRecordings() {
  try {
    console.log("🔍 Fetching annotators...");

    const annotators = await prisma.user.findMany({
      where: {
        is_annotator: true,
      },
      select: {
        id: true,
        username: true,
        annotation_recordings: true,
      },
    });

    console.log(`👥 Found ${annotators.length} annotators\n`);

    const internalDuplicates: {
      annotator: string;
      duplicates: string[];
      total: number;
    }[] = [];

    for (const annotator of annotators) {
      const seen = new Set<string>();
      const duplicates = new Set<string>();

      for (const recording of annotator.annotation_recordings) {
        if (seen.has(recording)) {
          duplicates.add(recording);
        } else {
          seen.add(recording);
        }
      }

      if (duplicates.size > 0) {
        internalDuplicates.push({
          annotator: `${annotator.username} (ID: ${annotator.id})`,
          duplicates: Array.from(duplicates),
          total: annotator.annotation_recordings.length,
        });
      }
    }

    console.log("==================================");
    console.log("📋 ANNOTATOR DUPLICATE REPORT");
    console.log("==================================\n");

    if (internalDuplicates.length === 0) {
      console.log(
        "✅ No annotators have duplicate recordings in their array\n"
      );
    } else {
      console.log("⚠️ Annotators with duplicate recordings:\n");

      for (const entry of internalDuplicates) {
        console.log(`👤 ${entry.annotator}`);
        console.log(`   Total Assignments: ${entry.total}`);
        console.log("   Duplicates:");
        entry.duplicates.forEach((rec) => {
          console.log(`   - ${rec}`);
        });
        console.log("");
      }
    }

    console.log("✅ Check complete.");
  } catch (err) {
    console.error("❌ Error checking duplicates:", err);
  } finally {
    await prisma.$disconnect();
  }
}

checkDuplicateAnnotationRecordings();
