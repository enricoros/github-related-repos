import React from "react";
import {
  Box, Button, Card, CardActions, CardContent, CircularProgress,
  Container, Grid, IconButton, Typography, makeStyles,
} from "@material-ui/core";
import ClearIcon from "@material-ui/icons/Clear";
import EqualizerIcon from '@material-ui/icons/Equalizer';
import clsx from "clsx";

import {connector} from "../logic/Connector";
import {ResultType} from "../../../common/SharedTypes";

// CSS for these components
const useStyles = makeStyles((theme) => ({
  resultsContainer: {
    borderRadius: theme.spacing(1),
    boxShadow: '0px 4px 30px 0px #e0e0e0',
    paddingBottom: theme.spacing(2),
    paddingTop: theme.spacing(1),
  },
  resultCard: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
  },
  resultCardContent: {
    flexGrow: 1,
  },

  resultQueued: {
    backgroundColor: 'rgba(0, 255, 255, 0.1)',
  },
  resultRunning: {
    backgroundColor: 'rgb(255 224 0)',
  },
}));

function ResultCard({classes, op}: { classes, op: ResultType }) {

  let cardExtraClass = null;
  let progressElement: JSX.Element = null;
  if (op.progress.running) {
    progressElement = <><CircularProgress color="secondary" size="1rem"/>&nbsp; Running ({op.progress.s_idx}/{op.progress.s_count})</>;
    cardExtraClass = classes.resultRunning;
  } else if (op.progress.done) {
  } else {
    progressElement = <>Queued</>;
    cardExtraClass = classes.resultQueued;
  }


  return <Card variant="outlined" className={clsx(classes.resultCard, cardExtraClass)}>
    <CardContent className={classes.resultCardContent}>
      <Box>
        <Typography variant="h6">
          {op.request.repoFullName}
        </Typography>
        <Typography variant="body1" gutterBottom>
          ({op.request.operation.toUpperCase()})
        </Typography>
      </Box>
      <Box display="flex" alignItems="baseline">
        <Typography>
          {progressElement}
        </Typography>
      </Box>
      {/*<Box>*/}
      {/*  <pre>*/}
      {/*  {JSON.stringify(op, null, '  ')}*/}
      {/*  </pre>*/}
      {/*</Box>*/}
      <Box>
        <Typography variant="subtitle2">
          Started on {new Date(op.progress.t_start * 1000).toLocaleString()}
        </Typography>
        <Typography variant="subtitle2">
          {op.uid}
        </Typography>
      </Box>

    </CardContent>
    <CardActions disableSpacing={true}>
      <Button size="medium" color="primary">CSV ↓</Button>
      <Button size="medium" color="primary">View</Button>
      <IconButton size="medium"><ClearIcon color="disabled"/></IconButton>
    </CardActions>
  </Card>;
}

export function Results() {
  const classes = useStyles();

  // Results list
  const [resultsList, setResultsList] = React.useState<ResultType[]>([]);
  React.useEffect(() => {
    const listener = list => setResultsList([...list]);
    connector.operationsList.addSubscriber(listener);
    return () => connector.operationsList.removeSubscriber(listener);
  }, []);

  // Group by Operation
  // @ts-ignore
  // const operationsGroups = [...new Set(resultsList.map(result => result.request.operation))];
  // console.log(operationsGroups);

  return <>
    <Container maxWidth="lg" className={classes.resultsContainer}>
      <Box display="flex" mb={1} mt={1}>
        <Box mr={2} mt="auto" mb="auto" display="flex" alignItems="center">
          <EqualizerIcon color="primary"/>
        </Box>
        <Typography variant="h6" color="primary">
          Latest results
        </Typography>
      </Box>

      <Grid container spacing={4}>
        {resultsList.map((result: ResultType) =>
          <Grid key={`result-${result.uid}`} item xs={12} sm={6} md={4} lg={3}>
            <ResultCard classes={classes} op={result}/>
          </Grid>
        )}
      </Grid>
    </Container>
  </>;
}