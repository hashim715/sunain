import { prisma } from "../config/postgres";

type AnnotatorRow = {
  id: number;
  username: string | null;
  annotation_recordings: string[];
};

async function checkDuplicateAssignmentsAcrossAnnotators() {
  try {
    console.log("🔍 Fetching annotators...");

    const annotators: AnnotatorRow[] = await prisma.user.findMany({
      where: { is_annotator: true },
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

    for (const a of annotators) {
      const seen = new Set<string>();
      const dups = new Set<string>();

      for (const rec of a.annotation_recordings ?? []) {
        if (!rec) continue;
        if (seen.has(rec)) dups.add(rec);
        else seen.add(rec);
      }

      if (dups.size > 0) {
        internalDuplicates.push({
          annotator: `${a.username ?? "(no username)"} (ID: ${a.id})`,
          duplicates: Array.from(dups),
          total: (a.annotation_recordings ?? []).length,
        });
      }
    }

    const recordingToAnnotators = new Map<
      string,
      { annotatorId: number; username: string }[]
    >();

    for (const a of annotators) {
      const username = a.username ?? "(no username)";
      for (const rec of a.annotation_recordings ?? []) {
        if (!rec) continue;

        const arr = recordingToAnnotators.get(rec) ?? [];
        arr.push({ annotatorId: a.id, username });
        recordingToAnnotators.set(rec, arr);
      }
    }

    const crossDuplicates = Array.from(recordingToAnnotators.entries())
      .filter(([, owners]) => owners.length > 1)
      .map(([recordingId, owners]) => ({
        recordingId,
        count: owners.length,
        owners,
      }))
      .sort((a, b) => b.count - a.count);

    console.log("==================================");
    console.log("📋 DUPLICATE ASSIGNMENT REPORT");
    console.log("==================================\n");

    console.log(
      "A) Internal duplicates (same annotator has same recording twice)\n"
    );

    if (internalDuplicates.length === 0) {
      console.log("✅ None found.\n");
    } else {
      console.log(
        `⚠️ Found ${internalDuplicates.length} annotators with internal duplicates:\n`
      );
      for (const entry of internalDuplicates) {
        console.log(`👤 ${entry.annotator}`);
        console.log(`   Total Assignments: ${entry.total}`);
        console.log("   Duplicates:");
        for (const rec of entry.duplicates) console.log(`   - ${rec}`);
        console.log("");
      }
    }

    console.log(
      "B) Cross-annotator duplicates (same recording assigned to multiple annotators)\n"
    );

    if (crossDuplicates.length === 0) {
      console.log("✅ No recordings are assigned to multiple annotators.\n");
    } else {
      console.log(
        `⚠️ Found ${crossDuplicates.length} recordings assigned to multiple annotators:\n`
      );
      for (const item of crossDuplicates) {
        console.log(`🎧 Recording: ${item.recordingId}`);
        console.log(`   Assigned to: ${item.count} annotators`);
        for (const o of item.owners) {
          console.log(`   - ${o.username} (ID: ${o.annotatorId})`);
        }
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

checkDuplicateAssignmentsAcrossAnnotators();
