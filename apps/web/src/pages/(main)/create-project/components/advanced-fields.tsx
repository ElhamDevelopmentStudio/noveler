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
        className="w-full flex items-center justify-between text-left cursor-pointer group py-1"
      >
        <span className="text-sm font-semibold text-neutral-900 group-hover:text-neutral-700 transition-colors">
          Advanced
        </span>
        <RiArrowDownSLine
          className={`h-4 w-4 text-neutral-400 transition-transform duration-200 ${
            isOpen ? "rotate-180 text-neutral-800" : ""
          }`}
        />
      </button>

      {/* Subtext matching screenshot */}
      <p className="text-xs text-neutral-500 mt-1 mb-4">
        Author, owner, language, genre, publication date, created date, and ISBN are optional and can be edited later.
      </p>

      {/* Expandable fields */}
      {isOpen && (
        <div className="space-y-4 pt-2 pb-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-neutral-800 mb-1.5">
                Author
              </label>
              <input
                type="text"
                placeholder="e.g. Mara Voss"
                {...register("author")}
                className="w-full px-3.5 py-2 text-sm rounded-lg border border-neutral-200 bg-white placeholder:text-neutral-400 text-neutral-900 focus:outline-hidden focus:border-neutral-900 transition-colors shadow-2xs"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-neutral-800 mb-1.5">
                Owner
              </label>
              <input
                type="text"
                placeholder="e.g. Mara Voss"
                {...register("owner")}
                className="w-full px-3.5 py-2 text-sm rounded-lg border border-neutral-200 bg-white placeholder:text-neutral-400 text-neutral-900 focus:outline-hidden focus:border-neutral-900 transition-colors shadow-2xs"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-neutral-800 mb-1.5">
                Language
              </label>
              <input
                type="text"
                placeholder="e.g. English"
                {...register("language")}
                className="w-full px-3.5 py-2 text-sm rounded-lg border border-neutral-200 bg-white placeholder:text-neutral-400 text-neutral-900 focus:outline-hidden focus:border-neutral-900 transition-colors shadow-2xs"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-neutral-800 mb-1.5">
                Genre
              </label>
              <input
                type="text"
                placeholder="e.g. Fiction"
                {...register("genre")}
                className="w-full px-3.5 py-2 text-sm rounded-lg border border-neutral-200 bg-white placeholder:text-neutral-400 text-neutral-900 focus:outline-hidden focus:border-neutral-900 transition-colors shadow-2xs"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-neutral-800 mb-1.5">
                Publication date
              </label>
              <input
                type="date"
                {...register("publication_date")}
                className="w-full px-3.5 py-2 text-sm rounded-lg border border-neutral-200 bg-white placeholder:text-neutral-400 text-neutral-900 focus:outline-hidden focus:border-neutral-900 transition-colors shadow-2xs"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-neutral-800 mb-1.5">
                Created date
              </label>
              <input
                type="date"
                {...register("created_date")}
                className="w-full px-3.5 py-2 text-sm rounded-lg border border-neutral-200 bg-white placeholder:text-neutral-400 text-neutral-900 focus:outline-hidden focus:border-neutral-900 transition-colors shadow-2xs"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-neutral-800 mb-1.5">
              ISBN
            </label>
            <input
              type="text"
              placeholder="e.g. 978-3-16-148410-0"
              {...register("isbn")}
              className="w-full px-3.5 py-2 text-sm rounded-lg border border-neutral-200 bg-white placeholder:text-neutral-400 text-neutral-900 focus:outline-hidden focus:border-neutral-900 transition-colors shadow-2xs"
            />
          </div>
        </div>
      )}
    </div>
  );
}
