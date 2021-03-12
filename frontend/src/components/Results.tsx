import React from "react";
import {Box, Button, Card, CardActions, CardContent, CircularProgress, Container, Grid, Typography, makeStyles,} from "@material-ui/core";
import EqualizerIcon from '@material-ui/icons/Equalizer';
import ReactTimeAgo from 'react-time-ago'
import clsx from "clsx";

import {connector} from "../logic/Connector";
import {ResultType} from "../../../common/SharedTypes";

// CSS for these components
const useStyles = makeStyles((theme) => ({
  resultsContainer: {
    borderRadius: theme.spacing(1),
    boxShadow: '0px 4px 30px 0px #e0e0e0',
    paddingTop: theme.spacing(1),
    paddingBottom: theme.spacing(3),
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
    progressElement = <>
      <Typography>
        Started <ReactTimeAgo date={new Date(op.progress.t_start * 1000)}/>
      </Typography>
      <Typography variant="subtitle2">
        Running ({op.progress.s_idx}/{op.progress.s_count})
      </Typography>
    </>;
    cardExtraClass = classes.resultRunning;
  } else if (op.progress.done) {
    progressElement = <Typography>
      {op.progress.error ? 'Failed' : 'Completed'} {op.progress.t_end > 0 && <ReactTimeAgo date={new Date(op.progress.t_end * 1000)}/>}
    </Typography>;
  } else {
    progressElement = <Typography>
      Queued <ReactTimeAgo date={new Date(op.progress.t_start * 1000)}/>
    </Typography>;
    cardExtraClass = classes.resultQueued;
  }

  return <Card variant="outlined" className={clsx(classes.resultCard, cardExtraClass)}>
    <CardContent className={classes.resultCardContent}>
      <Typography variant="button" gutterBottom component="div">
        {op.progress.running && <CircularProgress color="secondary" size="1rem" style={{marginRight: '0.5rem'}}/>}
        {op.request.repoFullName}
      </Typography>
      {op.progress.error && <Typography color="error">
        {op.progress.error}
      </Typography>}
      {progressElement}
      {/*{op.progress.t_elapsed > 0 && <Typography variant="subtitle2">*/}
      {/*  Duration: {op.progress.t_elapsed / 60} minutes*/}
      {/*</Typography>}*/}
      {/*<Typography variant="subtitle2" color="textSecondary">*/}
      {/*  {op.uid}*/}
      {/*</Typography>*/}
    </CardContent>
    <CardActions>
      <Button size="medium" color="primary" disabled={true}>Explore</Button>
      <Button size="medium" color="primary" disabled={true}>Download</Button>
      {/*{!op.progress.running && <IconButton size="medium"><ClearIcon color="disabled"/></IconButton>}*/}
    </CardActions>
  </Card>;
}

const operationNameMap = {
  'relatives': 'related',
};

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
  const operationsGroups = Array.from(new Set(resultsList.map(result => result.request.operation)));

  return <>
    {operationsGroups.length < 1 && <Box paddingTop={4} paddingBottom={4} style={{background: 'aliceblue'}}>
      <Container>
        <Typography variant="h5">
          Nothing to see yet.
        </Typography>
      </Container>
    </Box>}
    {operationsGroups.map(opName =>
      <Container key={'op-group-' + opName} maxWidth="lg" className={classes.resultsContainer}>
        <Box display="flex" mb={1} mt={1}>
          <Box mr={2} mt="auto" mb="auto" display="flex" alignItems="center">
            <EqualizerIcon color="primary"/>
          </Box>
          <Typography variant="h6" color="textSecondary">
            Latest <Typography variant="h6" color="primary" display="inline">{operationNameMap[opName] || 'experiments'}</Typography>
          </Typography>
        </Box>

        <Grid container spacing={2}>
          {resultsList.filter(result => result.request.operation === opName).map((result: ResultType) =>
            <Grid key={`result-${result.uid}`} item xs={12} sm={6} md={4} lg={3}>
              <ResultCard classes={classes} op={result}/>
            </Grid>
          )}
        </Grid>
      </Container>
    )}
  </>;
}