-- AlterTable
ALTER TABLE "users" ADD COLUMN     "annotation_dirs" TEXT[] DEFAULT ARRAY[]::TEXT[];
