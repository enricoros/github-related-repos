import React from "react";

import {Results} from "./components/Results";
import {Footer} from "./components/Footer";
import {NewOperation} from "./components/NewOperation";
import {TopBar} from "./components/TopBar";

export function App() {
  return (
    <React.Fragment>
      <TopBar/>
      <main>
        <NewOperation/>
        <Results/>
      </main>
      <Footer/>
    </React.Fragment>
  );
}
