import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { fetchQuery } from "convex/nextjs";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import type { EnrichedPost } from "../../../convex/types";
import { absoluteUrl, stripBbCode, truncateText } from "../../lib/site";
import { imageUrlsFor, mediaObjectsFor } from "../../lib/structuredData";
import PostDetailClient from "./PostDetailClient";

type PostPageProps = {
  params: Promise<{ postId: string }>;
};

async function loadPost(postId: string) {
  try {
    return (await fetchQuery(api.posts.get, {
      postId: postId as Id<"posts">,
    })) as EnrichedPost | null;
  } catch {
    return null;
  }
}

function postDescription(post: EnrichedPost) {
  return truncateText(
    stripBbCode(post.plainTextExcerpt ?? post.legacyBody ?? post.body ?? post.title),
    155
  );
}

export async function generateMetadata({
  params,
}: PostPageProps): Promise<Metadata> {
  const { postId } = await params;
  const post = await loadPost(postId);

  if (!post) {
    return {
      title: "Idea not found",
      robots: { index: false, follow: true },
    };
  }

  const description = postDescription(post);
  const image = imageUrlsFor(post.media)[0];

  return {
    title: post.title,
    description,
    alternates: {
      canonical: `/post/${post._id}`,
    },
    robots: {
      index: !post.nsfw,
      follow: true,
    },
    openGraph: {
      title: `${post.title} | Witty.Cafe`,
      description,
      url: absoluteUrl(`/post/${post._id}`),
      siteName: "Witty.Cafe",
      type: "article",
      images: image ? [{ url: image, alt: post.title }] : undefined,
    },
    twitter: {
      card: image ? "summary_large_image" : "summary",
      title: `${post.title} | Witty.Cafe`,
      description,
      images: image ? [image] : undefined,
    },
  };
}

export default async function PostPage({ params }: PostPageProps) {
  const { postId } = await params;
  const post = await loadPost(postId);

  if (!post) notFound();

  const mediaObjects = mediaObjectsFor(post.media, post.title);
  const images = imageUrlsFor(post.media);
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "CreativeWork",
    name: post.title,
    url: absoluteUrl(`/post/${post._id}`),
    abstract: postDescription(post),
    text: stripBbCode(post.plainTextExcerpt ?? post.legacyBody ?? post.body ?? ""),
    datePublished: new Date(post.createdAt).toISOString(),
    dateModified: new Date(post.modifiedAt ?? post.createdAt).toISOString(),
    isPartOf: post.collection
      ? {
          "@type": "CollectionPage",
          name: post.collection.name,
          url: absoluteUrl(`/collections/${post.collection.slug}`),
        }
      : undefined,
    genre: post.flavor.name,
    keywords: post.vibes.map((vibe) => vibe.name),
    image: images.length ? images : undefined,
    associatedMedia: mediaObjects.length ? mediaObjects : undefined,
    interactionStatistic: [
      {
        "@type": "InteractionCounter",
        interactionType: "https://schema.org/LikeAction",
        userInteractionCount: Object.values(post.reactionCounts).reduce(
          (total, value) => total + value,
          0
        ),
      },
      {
        "@type": "InteractionCounter",
        interactionType: "https://schema.org/CommentAction",
        userInteractionCount: post.commentCount,
      },
    ],
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
      <PostDetailClient postId={post._id} initialPost={post} />
    </>
  );
}
