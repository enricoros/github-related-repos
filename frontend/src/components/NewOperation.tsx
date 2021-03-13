import React from "react";
import {Box, Button, Container, Grid, IconButton, makeStyles, Paper, TextField, Typography} from "@material-ui/core";
import ArrowDropUpIcon from "@material-ui/icons/ArrowDropUp";
import ArrowDropDownIcon from "@material-ui/icons/ArrowDropDown";
import PlayArrowIcon from '@material-ui/icons/PlayArrow';

import {connector} from "../logic/Connector";


const useStyles = makeStyles((theme) => ({
  heroHeadline: {
    fontWeight: 200,
    marginBottom: theme.spacing(6),
  },
  operationLink: {
    color: theme.palette.secondary.dark,
    // cursor: 'pointer',
    // textDecoration: 'underline 0.3rem dotted',
    // textDecorationColor: theme.palette.secondary.dark,
  },
  prefContainers: {
    // flexGrow: 1,
    marginBottom: theme.spacing(2),
  },
}));


const PrefLabel = (props: { title: string, subTitle: string, disabled?: boolean }) =>
  <Grid item xs={12} sm={5} style={props.disabled ? {color: 'lightgray'} : {}}>
    <Typography variant="body1">{props.title}</Typography>
    {props.subTitle && <Typography variant="caption" color="textPrimary">{props.subTitle}</Typography>}
  </Grid>;

const PrefString = ({str, setStr, updateCb}: { str, setStr?, updateCb? }) =>
  <Grid item xs={12} sm={7}>
    <TextField type="text" disabled={setStr === undefined} inputProps={{spellCheck: 'false'}}
               value={str} onChange={event => setStr && setStr(event.target.value)}/>
    {updateCb && <Button onClick={updateCb}>Update</Button>}
  </Grid>;

const PrefInt = ({label, value, setValue}) =>
  <Grid item xs={12} sm={7}>
    <TextField label={label} type="number" disabled={setValue === undefined}
               value={value} onChange={event => setValue && setValue(event.target.value)}/>
  </Grid>;


export function NewOperation() {
  const classes = useStyles();

  // UI state
  const [repoName, setRepoName] = React.useState<string>('');
  const [maxStarsPerUser, setMaxStarsPerUser] = React.useState<number>(200);
  const [openPrefPane, setOpenPrefPane] = React.useState<boolean>(false);

  const repoNameValid = () => repoName.split('/').length === 2 && !repoName.endsWith('/');
  const ready = repoNameValid();

  const startClicked = () => {
    if (!ready) return;
    connector.sendNewOperation({
      operation: 'relatives',
      repoFullName: repoName,
      maxStarsPerUser: maxStarsPerUser,
    });
  };

  return <Box mt={8} mb={6}><Container maxWidth="md">

    {/* Headline with Operation Selector */}
    <Typography variant="h3" color="textPrimary" align="center" className={classes.heroHeadline}>
      Find <Box display="inline" className={classes.operationLink}>related</Box> GitHub repositories
    </Typography>

    {/* Repo Name & Start button */}
    <Box display="flex" flexDirection="row" flexWrap="wrap" style={{placeContent: 'center'}}>
      <Box flexGrow={1}>
        <TextField label="GitHub Repository Name" variant="outlined" fullWidth style={{minWidth: '12em'}}
                   placeholder="e.g. huggingface/transformers" value={repoName} onChange={t => setRepoName(t.target.value)}
                   onKeyPress={ev => ev.key === 'Enter' && startClicked()}
                   InputProps={{
                     endAdornment: <IconButton size="small" color="secondary"
                                               onClick={() => setOpenPrefPane(!openPrefPane)}>{openPrefPane ?
                       <ArrowDropUpIcon fontSize="large"/> : <ArrowDropDownIcon fontSize="large"/>}</IconButton>
                   }}/>
      </Box>
      <Button variant="text" color="primary" size="large" disabled={!ready} style={{padding: '0 1rem'}}
              onClick={() => startClicked()} endIcon={<PlayArrowIcon style={{fontSize: '2rem'}}/>}>
        Begin Scan
      </Button>
    </Box>

    {/* Advanced Properties Panel */}
    {openPrefPane && <Box flexGrow={1}>
      <Paper elevation={2} style={{backgroundColor: '#f8f8f8', padding: 0}}>
        <Box padding={1}>
          <Typography variant="subtitle2" color="secondary" align="center">
            Advanced configuration
          </Typography>
        </Box>
        <Box padding={2}>
          <Grid container className={classes.prefContainers} spacing={3}>
            <PrefLabel title="Repository" subTitle="Org/Name for the project"/>
            <PrefString str={repoName}/>
          </Grid>
          <Grid container className={classes.prefContainers} spacing={3}>
            <PrefLabel title="Max User Stars" subTitle="Ignore users with more than these stars"/>
            <PrefInt label="Stars" value={maxStarsPerUser} setValue={setMaxStarsPerUser}/>
          </Grid>
          {/*<Grid container className={classes.prefContainers} spacing={3}>*/}
          {/*  <PrefLabel title="Source" subTitle="Kind of analysis"/>*/}
          {/*  <PrefButtonInt names={['Relatives']} int={theme} setInt={setTheme} color="secondary"/>*/}
          {/*</Grid>*/}
        </Box>
      </Paper>
    </Box>}

    <Box mt={4}>
      {/* Disclaimer */}
      <Typography variant="body1" color="textSecondary" align="center">
        This web application is a prototype.
      </Typography>

      {/* Github Star button */}
      <Typography variant="body1" color="textSecondary" style={{display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
        Be meta and &nbsp; <a className="github-button" href="https://github.com/enricoros/github-analyzer"
                              data-icon="octicon-star" data-size="large"
                              data-show-count="true" aria-label="Star enricoros/github-analyzer on GitHub">Star</a> &nbsp; me.
      </Typography>
    </Box>

  </Container></Box>;
}