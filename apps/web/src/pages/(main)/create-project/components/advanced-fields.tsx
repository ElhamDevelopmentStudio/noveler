import { useState } from "react";
import { RiArrowDownSLine } from "@remixicon/react";
import type { UseFormRegister } from "react-hook-form";

interface AdvancedFieldsProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  register: UseFormRegister<any>;
}

export function AdvancedFields({ register }: AdvancedFieldsProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="pt-2">
      {/* Toggle header row matching screenshot */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        aria-controls="create-project-advanced-fields"
        className="w-full flex items-center justify-between text-left cursor-pointer group py-1 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="text-sm font-semibold text-neutral-900 dark:text-neutral-100 group-hover:text-neutral-700 dark:group-hover:text-neutral-300 transition-colors">
          Advanced
        </span>
        <RiArrowDownSLine
          aria-hidden="true"
          className={`h-4 w-4 text-neutral-400 dark:text-neutral-500 transition-transform duration-200 ${
            isOpen ? "rotate-180 text-neutral-800 dark:text-neutral-200" : ""
          }`}
        />
      </button>

      {/* Subtext matching screenshot */}
      <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1 mb-4">
        Author, owner, language, genre, publication date, created date, and ISBN are optional and can be edited later.
      </p>

      {/* Expandable fields */}
      {isOpen && (
        <div id="create-project-advanced-fields" className="space-y-4 pt-2 pb-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="project-author" className="block text-xs font-semibold text-neutral-800 dark:text-neutral-200 mb-1.5">
                Author
              </label>
              <input
                id="project-author"
                type="text"
                placeholder="e.g. Mara Voss"
                {...register("author")}
                className="w-full px-3.5 py-2 text-sm rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 placeholder:text-neutral-400 dark:placeholder:text-neutral-500 text-neutral-900 dark:text-neutral-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-colors shadow-2xs"
              />
            </div>

            <div>
              <label htmlFor="project-owner" className="block text-xs font-semibold text-neutral-800 dark:text-neutral-200 mb-1.5">
                Owner
              </label>
              <input
                id="project-owner"
                type="text"
                placeholder="e.g. Mara Voss"
                {...register("owner")}
                className="w-full px-3.5 py-2 text-sm rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 placeholder:text-neutral-400 dark:placeholder:text-neutral-500 text-neutral-900 dark:text-neutral-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-colors shadow-2xs"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="project-language" className="block text-xs font-semibold text-neutral-800 dark:text-neutral-200 mb-1.5">
                Language
              </label>
              <input
                id="project-language"
                type="text"
                placeholder="e.g. English"
                {...register("language")}
                className="w-full px-3.5 py-2 text-sm rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 placeholder:text-neutral-400 dark:placeholder:text-neutral-500 text-neutral-900 dark:text-neutral-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-colors shadow-2xs"
              />
            </div>

            <div>
              <label htmlFor="project-genre" className="block text-xs font-semibold text-neutral-800 dark:text-neutral-200 mb-1.5">
                Genre
              </label>
              <input
                id="project-genre"
                type="text"
                placeholder="e.g. Fiction"
                {...register("genre")}
                className="w-full px-3.5 py-2 text-sm rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 placeholder:text-neutral-400 dark:placeholder:text-neutral-500 text-neutral-900 dark:text-neutral-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-colors shadow-2xs"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="project-publication-date" className="block text-xs font-semibold text-neutral-800 dark:text-neutral-200 mb-1.5">
                Publication date
              </label>
              <input
                id="project-publication-date"
                type="date"
                {...register("publication_date")}
                className="w-full px-3.5 py-2 text-sm rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 placeholder:text-neutral-400 dark:placeholder:text-neutral-500 text-neutral-900 dark:text-neutral-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-colors shadow-2xs"
              />
            </div>

            <div>
              <label htmlFor="project-created-date" className="block text-xs font-semibold text-neutral-800 dark:text-neutral-200 mb-1.5">
                Created date
              </label>
              <input
                id="project-created-date"
                type="date"
                {...register("created_date")}
                className="w-full px-3.5 py-2 text-sm rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 placeholder:text-neutral-400 dark:placeholder:text-neutral-500 text-neutral-900 dark:text-neutral-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-colors shadow-2xs"
              />
            </div>
          </div>

          <div>
            <label htmlFor="project-isbn" className="block text-xs font-semibold text-neutral-800 dark:text-neutral-200 mb-1.5">
              ISBN
            </label>
            <input
              id="project-isbn"
              type="text"
              placeholder="e.g. 978-3-16-148410-0"
              {...register("isbn")}
              className="w-full px-3.5 py-2 text-sm rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 placeholder:text-neutral-400 dark:placeholder:text-neutral-500 text-neutral-900 dark:text-neutral-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-colors shadow-2xs"
            />
          </div>
        </div>
      )}
    </div>
  );
}
