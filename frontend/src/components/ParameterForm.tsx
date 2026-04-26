import { useState } from "react";
import type { MissingParam } from "../api/types";

export function ParameterForm({
  missing,
  onSave,
  onCancel,
  saving,
}: {
  missing: MissingParam[];
  onSave: (values: Record<string, string>) => void;
  onCancel: () => void;
  saving: boolean;
}) {
  const [values, setValues] = useState<Record<string, string>>(
    Object.fromEntries(missing.map((p) => [p.key, ""]))
  );

  const allFilled = missing.every((p) => values[p.key]?.trim());

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!allFilled) return;
    onSave(values);
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-2xl w-[480px] max-h-[80vh] flex flex-col">
        <div className="px-5 py-4 border-b border-gray-200">
          <h2 className="text-sm font-semibold text-gray-800">Pipeline requires parameters</h2>
          <p className="text-xs text-gray-500 mt-0.5">Fill in the values below to run this pipeline.</p>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-auto">
          <div className="px-5 py-4 flex flex-col gap-4">
            {missing.map((param) => (
              <div key={param.key}>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  {param.label}
                  <span className="ml-1 text-red-500">*</span>
                  {param.type === "secret" && (
                    <span className="ml-2 text-xs font-normal text-gray-400">secret</span>
                  )}
                </label>
                {param.description && (
                  <p className="text-xs text-gray-400 mb-1.5">{param.description}</p>
                )}
                <input
                  type={param.type === "secret" ? "password" : "text"}
                  value={values[param.key]}
                  onChange={(e) =>
                    setValues((prev) => ({ ...prev, [param.key]: e.target.value }))
                  }
                  placeholder={param.key}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            ))}
          </div>

          <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-gray-200">
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-1.5 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!allFilled || saving}
              className="px-4 py-1.5 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
            >
              {saving ? "Starting…" : "Run pipeline"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
