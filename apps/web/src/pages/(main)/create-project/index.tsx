import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import * as z from "zod";
import { RiArrowRightLine, RiLoader4Line } from "@remixicon/react";
import { CreateProjectHeader } from "./components/create-project-header";
import { ManuscriptDropzone } from "./components/manuscript-dropzone";
import { ThumbnailDropzone } from "./components/thumbnail-dropzone";
import { AdvancedFields } from "./components/advanced-fields";
import { createProject } from "@/services/projects";
import { startParseJob } from "@/services/chapters";
import type { Attachment } from "@novelova/shared-types";
import { ScrollFade } from "@/components/ui/scroll-fade";

const createProjectSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, "Project name is required")
    .max(255, "Project name is too long"),
  author: z.string().optional(),
  owner: z.string().optional(),
  language: z.string().optional(),
  genre: z.string().optional(),
  publication_date: z.string().optional(),
  created_date: z.string().optional(),
  isbn: z.string().optional(),
});

type FormValues = z.infer<typeof createProjectSchema>;

export function CreateProjectPage() {
  const navigate = useNavigate();
  const [manuscriptAttachment, setManuscriptAttachment] =
    useState<Attachment | null>(null);
  const [thumbnailAttachment, setThumbnailAttachment] =
    useState<Attachment | null>(null);
  const [isUploadingManuscript, setIsUploadingManuscript] = useState(false);
  const [isUploadingThumbnail, setIsUploadingThumbnail] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    getValues,
    setValue,
    formState: { errors, isDirty },
  } = useForm<FormValues>({
    resolver: zodResolver(createProjectSchema),
    defaultValues: {
      title: "",
      author: "",
      owner: "",
      language: "",
      genre: "",
      publication_date: "",
      created_date: "",
      isbn: "",
    },
  });

  const hasUnsavedWork =
    !isSubmitting &&
    (isDirty || Boolean(manuscriptAttachment) || Boolean(thumbnailAttachment));

  useEffect(() => {
    if (!hasUnsavedWork) return;
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [hasUnsavedWork]);

  const onSubmit = async (values: FormValues) => {
    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const created = await createProject({
        title: values.title.trim(),
        author: values.author?.trim() || null,
        owner: values.owner?.trim() || null,
        language: values.language?.trim() || null,
        genre: values.genre?.trim() || null,
        publication_date: values.publication_date || null,
        created_date: values.created_date || null,
        isbn: values.isbn?.trim() || null,
        manuscript_attachment_id: manuscriptAttachment?.id || null,
        thumbnail_attachment_id: thumbnailAttachment?.id || null,
      });

      if (created?.id && manuscriptAttachment?.id) {
        try {
          await startParseJob(created.id);
        } catch {
          toast.warning(
            "Project created, but auto-parsing could not start automatically. You can trigger Parse inside the workspace.",
          );
        }
      }

      navigate(created?.id ? `/projects/${created.id}` : "/projects");
    } catch (err: unknown) {
      if (err instanceof Error) {
        setSubmitError(err.message);
      } else {
        setSubmitError("Failed to create project. Please try again.");
      }
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      {/* Top Header */}
      <CreateProjectHeader />

      {/* Main Content Area */}
      <ScrollFade className="flex-1 w-full">
        <main className="w-full max-w-2xl mx-auto px-6 py-12">
          {/* Page Heading matching screenshot */}
          <div className="mb-8">
            <h1 className="text-3xl font-bold tracking-tight text-neutral-900 dark:text-neutral-100">
              Create a new project
            </h1>
            <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-2">
              Add a project name and manuscript, then optionally include a thumbnail before creating the project.
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            {submitError && (
              <div className="p-3 text-sm text-destructive bg-destructive/10 rounded-xl">
                {submitError}
              </div>
            )}

            {/* Project name */}
            <div>
              <label
                htmlFor="project-name-input"
                className="block text-sm font-semibold text-neutral-900 dark:text-neutral-100 mb-2"
              >
                Project name
              </label>
              <input
                id="project-name-input"
                type="text"
                placeholder="e.g. The Night Orchard"
                {...register("title")}
                className="w-full px-4 py-2.5 text-sm rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-black placeholder:text-neutral-400 dark:placeholder:text-neutral-500 text-neutral-900 dark:text-neutral-100 focus:outline-hidden focus:border-neutral-900 dark:focus:border-neutral-100 transition-colors shadow-2xs"
              />
              {errors.title && (
                <p className="text-xs text-destructive mt-1.5">
                  {errors.title.message}
                </p>
              )}
            </div>

            {/* Manuscript Dropzone */}
            <ManuscriptDropzone
              attachment={manuscriptAttachment}
              onUploadingChange={setIsUploadingManuscript}
              onChange={(_, att) => {
                setManuscriptAttachment(att);
                if (att?.filename && !getValues("title")?.trim()) {
                  const derivedTitle = att.filename
                    .replace(/\.[^/.]+$/, "")
                    .replace(/[_-]+/g, " ")
                    .trim();
                  if (derivedTitle) {
                    setValue("title", derivedTitle, { shouldValidate: true });
                  }
                }
              }}
            />

            {/* Thumbnail Dropzone with Profile Photo upload flow */}
            <ThumbnailDropzone
              attachment={thumbnailAttachment}
              onUploadingChange={setIsUploadingThumbnail}
              onChange={(_, att) => setThumbnailAttachment(att)}
            />

            {/* Advanced accordion */}
            <AdvancedFields register={register} />

            {/* Action Buttons matching screenshot */}
            <div className="pt-6 border-t border-neutral-100 dark:border-neutral-800 flex items-center justify-end gap-3 mt-8">
              <button
                type="button"
                onClick={() => navigate("/projects")}
                className="px-5 py-2.5 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-black hover:bg-neutral-50 dark:hover:bg-neutral-900 text-sm font-medium text-neutral-800 dark:text-neutral-200 transition-colors shadow-2xs cursor-pointer"
              >
                Cancel
              </button>

              <button
                type="submit"
                disabled={isSubmitting || isUploadingManuscript || isUploadingThumbnail}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-neutral-900 hover:bg-neutral-800 dark:bg-neutral-100 dark:hover:bg-neutral-200 disabled:opacity-50 text-white dark:text-neutral-900 font-medium text-sm transition-colors shadow-2xs cursor-pointer"
              >
                {isSubmitting ? (
                  <>
                    <RiLoader4Line className="h-4 w-4 animate-spin" />
                    <span>Creating...</span>
                  </>
                ) : isUploadingManuscript || isUploadingThumbnail ? (
                  <>
                    <RiLoader4Line className="h-4 w-4 animate-spin" />
                    <span>Uploading file...</span>
                  </>
                ) : (
                  <>
                    <span>
                      {manuscriptAttachment ? "Create & Parse" : "Create project"}
                    </span>
                    <RiArrowRightLine className="h-4 w-4" />
                  </>
                )}
              </button>
            </div>
          </form>
        </main>
      </ScrollFade>
    </div>
  );
}

export default CreateProjectPage;
