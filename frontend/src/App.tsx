import React from "react";

import {Results} from "./components/Results";
import {Footer} from "./components/Footer";
import {NewOperation} from "./components/NewOperation";
import {TopBar} from "./components/TopBar";
import {Box, Container, Typography} from "@material-ui/core";

export function App() {
  return (
    <React.Fragment>
      <TopBar/>
      <main>
        <NewOperation/>
        <Results/>

        <Box mt={8} mb={6}>
          <Container>
            <Typography variant="h4" style={{fontWeight: 200}}>
              Instructions
            </Typography>
            <Typography style={{fontWeight: 200}}>
              Where we are going we don't need instructions.
            </Typography>
          </Container>
        </Box>
      </main>
      <Footer/>
    </React.Fragment>
  );
}
