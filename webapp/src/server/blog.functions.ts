import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  getAllPostSummaries,
  getPostBySlug,
  getPrevNextPost,
} from "./blog.server";

export const getBlogPosts = createServerFn({ method: "GET" }).handler(
  async () => getAllPostSummaries(),
);

export const getBlogPost = createServerFn({ method: "GET" })
  .inputValidator(z.string())
  .handler(async ({ data: slug }) => {
    const post = getPostBySlug(slug);
    if (!post) return null;
    const { prev, next } = getPrevNextPost(slug);
    return { post, prev, next };
  });
