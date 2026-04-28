import * as esbuild from "esbuild";

export async function compileRendererTsx(tsx: string): Promise<string> {
  const result = await esbuild.transform(tsx, {
    loader: "tsx",
    jsxFactory: "React.createElement",
    jsxFragment: "React.Fragment",
    target: "es2020",
  });
  return result.code;
}
