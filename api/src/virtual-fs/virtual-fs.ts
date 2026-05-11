export class VirtualFS {
    files = new Map<string, string>()

    constructor(files: Map<string, string> = new Map()) {
        this.files = files
    }

    strReplaceTool = {
        name: 'str_replace',
        description: 'Replace old_str with new_str in a file. Requires old_str to appear exactly once — returns an error if it appears zero or more than once.',
        input_schema: {
            type: 'object' as const,
            properties: {
                path: { type: 'string', description: 'File path relative to project root' },
                old_str: { type: 'string', description: 'Exact string to find and replace' },
                new_str: { type: 'string', description: 'Replacement string' },
            },
            required: ['path', 'old_str', 'new_str'],
        },
        handler: async (input: Record<string, unknown>) => {
            const path = input.path as string
            const oldStr = input.old_str as string
            const newStr = input.new_str as string
            if (oldStr === '') {
                this.files.set(path, newStr)
                return { success: true, path }
            }
            const existing = this.files.get(path)
            if (existing == null) return { error: `File not found: ${path}` }
            const count = existing.split(oldStr).length - 1
            if (count === 0) return { error: `old_str not found in ${path}` }
            if (count > 1) return { error: `old_str appears ${count} times in ${path} — make it unique before replacing` }
            this.files.set(path, existing.replace(oldStr, newStr))
            return { success: true, path }
        },
    }

    appendTextTool = {
        name: 'append_text',
        description: 'Append text to the end of a file. Creates the file if it does not exist.',
        input_schema: {
            type: 'object' as const,
            properties: {
                path: { type: 'string', description: 'File path relative to project root' },
                text: { type: 'string', description: 'Text to append' },
            },
            required: ['path', 'text'],
        },
        handler: async (input: Record<string, unknown>) => {
            const path = input.path as string
            const text = input.text as string
            const existing = this.files.get(path) ?? ''
            this.files.set(path, existing + text)
            return { success: true, path }
        },
    }

    readFileTool = {
        name: 'read_file',
        description: 'Read a file previously written in this session.',
        input_schema: {
            type: 'object' as const,
            properties: { path: { type: 'string' } },
            required: ['path'],
        },
        handler: async (input: Record<string, unknown>) => ({
            content: this.files.get(input.path as string) ?? null,
        }),
    }

    listFilesTool = {
        name: 'list_files',
        description: 'List all files currently written in the app project.',
        input_schema: { type: 'object' as const, properties: {} },
        handler: async () => ({ files: [...this.files.keys()] }),
    }

    grepFileTool = {
        name: 'grep_file',
        description: 'Search for a pattern in a specific file. Returns matching lines with their line numbers and optional surrounding context. Use this instead of read_file when you only need to check a specific function, import, or component name.',
        input_schema: {
            type: 'object' as const,
            properties: {
                path: { type: 'string', description: 'File path relative to project root' },
                pattern: { type: 'string', description: 'Regular expression pattern to search for' },
                contextLines: { type: 'number', description: 'Number of lines of context to include before and after each match (default: 2)' },
            },
            required: ['path', 'pattern'],
        },
        handler: async (input: Record<string, unknown>) => {
            const content = this.files.get(input.path as string)
            if (content == null) return { error: `File not found: ${input.path}` }
            const lines = content.split('\n')
            const regex = new RegExp(input.pattern as string)
            const context = (input.contextLines as number | undefined) ?? 2
            const matchedRanges: Array<[number, number]> = []
            lines.forEach((line, i) => { if (regex.test(line)) matchedRanges.push([Math.max(0, i - context), Math.min(lines.length - 1, i + context)]) })
            if (matchedRanges.length === 0) return { matches: [] }
            const merged: Array<[number, number]> = [matchedRanges[0]]
            for (const [start, end] of matchedRanges.slice(1)) {
                if (start <= merged[merged.length - 1][1] + 1) merged[merged.length - 1][1] = Math.max(merged[merged.length - 1][1], end)
                else merged.push([start, end])
            }
            const matches = merged.map(([start, end]) => ({
                startLine: start + 1,
                lines: lines.slice(start, end + 1).map((l, i) => `${start + i + 1}: ${l}`).join('\n'),
            }))
            return { matches }
        },
    }

    readFileRangeTool = {
        name: 'read_file_range',
        description: 'Read a specific range of lines from a file. Use this when you know which section you need (e.g. a specific component or function) instead of reading the entire file.',
        input_schema: {
            type: 'object' as const,
            properties: {
                path: { type: 'string', description: 'File path relative to project root' },
                startLine: { type: 'number', description: '1-based line number to start reading from' },
                endLine: { type: 'number', description: '1-based line number to stop reading at (inclusive)' },
            },
            required: ['path', 'startLine', 'endLine'],
        },
        handler: async (input: Record<string, unknown>) => {
            const content = this.files.get(input.path as string)
            if (content == null) return { error: `File not found: ${input.path}` }
            const lines = content.split('\n')
            const start = Math.max(0, (input.startLine as number) - 1)
            const end = Math.min(lines.length, input.endLine as number)
            return { content: lines.slice(start, end).map((l, i) => `${start + i + 1}: ${l}`).join('\n'), totalLines: lines.length }
        },
    }

    searchFilesTool = {
        name: 'search_files',
        description: 'Search for a pattern across all files in the project. Returns file names and matching lines with line numbers. Use this to find where a type, function, or import is defined across the codebase.',
        input_schema: {
            type: 'object' as const,
            properties: {
                pattern: { type: 'string', description: 'Regular expression pattern to search for' },
                contextLines: { type: 'number', description: 'Number of context lines around each match (default: 1)' },
            },
            required: ['pattern'],
        },
        handler: async (input: Record<string, unknown>) => {
            const regex = new RegExp(input.pattern as string)
            const context = (input.contextLines as number | undefined) ?? 1
            const results: Array<{ path: string; matches: Array<{ line: number; text: string }> }> = []
            for (const [path, content] of this.files) {
                const lines = content.split('\n')
                const fileMatches: Array<{ line: number; text: string }> = []
                lines.forEach((line, i) => {
                    if (regex.test(line)) {
                        const start = Math.max(0, i - context)
                        const end = Math.min(lines.length - 1, i + context)
                        lines.slice(start, end + 1).forEach((l, j) => fileMatches.push({ line: start + j + 1, text: l }))
                    }
                })
                if (fileMatches.length > 0) results.push({ path, matches: fileMatches })
            }
            return { results }
        },
    }
}