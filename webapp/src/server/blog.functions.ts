import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const getBlogPosts = createServerFn({ method: "GET" }).handler(
  async () => {
    const { getAllPostSummaries } = await import("./blog.server");
    return getAllPostSummaries();
  },
);

export const getBlogPost = createServerFn({ method: "GET" })
  .inputValidator(z.string())
  .handler(async ({ data: slug }) => {
    const { getPostBySlug, getPrevNextPost } = await import("./blog.server");
    const post = getPostBySlug(slug);
    if (!post) return null;
    const { prev, next } = getPrevNextPost(slug);
    return { post, prev, next };
  });
