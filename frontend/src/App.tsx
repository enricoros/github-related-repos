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
      </main>
      <section style={{backgroundColor: '#20ab77'}}>
        <Container>
          <Box mt={8} mb={8}>
            <Typography gutterBottom>
              What it does
            </Typography>
            <Typography gutterBottom>
              Instructions
            </Typography>
          </Box>
        </Container>
      </section>
      <Footer/>
    </React.Fragment>
  );
}
