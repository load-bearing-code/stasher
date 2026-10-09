import { Button } from "@stasher/ui/components/button";
import {
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@stasher/ui/components/card";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  component: IndexComponent,
});

function IndexComponent() {
  return (
    <main className="flex min-h-svh items-center justify-center p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Stasher</CardTitle>
          <CardDescription>Vite + shadcn + Base UI web app.</CardDescription>
        </CardHeader>
        <CardFooter className="justify-end">
          <Button>Get started</Button>
        </CardFooter>
      </Card>
    </main>
  );
}
