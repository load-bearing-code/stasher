import { createFileRoute } from "@tanstack/react-router";
import { FeedScreen } from "@/features/feed/feed-screen";

export const Route = createFileRoute("/feed")({
  component: FeedScreen,
});
