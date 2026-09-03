import { Switch, Route, Router } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/lib/theme";
import { XpPopupProvider } from "@/components/XpPopup";
import NotFound from "@/pages/not-found";
import Home from "@/pages/home";
import Tasks from "@/pages/tasks";
import Events from "@/pages/events";
import Notes from "@/pages/notes";
import Settings from "@/pages/settings";
import Shop from "@/pages/shop";
import Feed from "@/pages/feed";
import Companions from "@/pages/companions";
import Focus from "@/pages/focus";

function AppRouter() {
  return (
    <Switch>
      {/* Register a <Route path="..." component={...} /> for EVERY page linked in your sidebar/nav. Missing routes cause 404. */}
      <Route path="/" component={Home} />
      <Route path="/tasks" component={Tasks} />
      <Route path="/events" component={Events} />
      <Route path="/notes" component={Notes} />
      <Route path="/shop" component={Shop} />
      <Route path="/feed" component={Feed} />
      <Route path="/companions" component={Companions} />
      <Route path="/focus" component={Focus} />
      <Route path="/settings" component={Settings} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <TooltipProvider>
          <Toaster />
          <XpPopupProvider>
            <Router hook={useHashLocation}>
              <AppRouter />
            </Router>
          </XpPopupProvider>
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
