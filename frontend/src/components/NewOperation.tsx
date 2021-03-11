import React from "react";
import {
  Box, Container, FormControl, IconButton, InputLabel, makeStyles,
  MenuItem, Paper, Select, TextField, Typography
} from "@material-ui/core";
import ArrowDropUpIcon from "@material-ui/icons/ArrowDropUp";
import ArrowDropDownIcon from "@material-ui/icons/ArrowDropDown";
import PlayCircleFilledIcon from "@material-ui/icons/PlayCircleFilled";

import {connector} from "../logic/Connector";

// CSS for this component
const useStyles = makeStyles((theme) => ({
  heroContent: {
    backgroundColor: theme.palette.background.paper,
    padding: theme.spacing(8, 0, 6),
  },
  heroParamsPane: {
    padding: theme.spacing(1, 1.5),
  },
}));

export function NewOperation() {
  const classes = useStyles();

  // UI state
  const [repoName, setRepoName] = React.useState<string>('');
  const [maxStarsPerUser, setMaxStarsPerUser] = React.useState<number>(200);
  const [openAdvanced, setOpenAdvanced] = React.useState<boolean>(false);

  const repoNameValid = () => repoName.split('/').length === 2 && !repoName.endsWith('/');
  const ready = repoNameValid();

  function startRelativesOperation() {
    if (!repoNameValid()) {
      // else:  // TODO: UI-warning
      //   console.log('Text too short:', text);
    } else {
      connector.sendNewOperation({
        operation: 'relatives',
        repoFullName: repoName,
        maxStarsPerUser: 200,
      });
    }
  }

  return <div className={classes.heroContent}>
    <Container component="main" maxWidth="lg">
      {/* Title */}
      <Typography component="h2" variant="h3" align="center" color="textPrimary" gutterBottom style={{fontWeight: 200}}>
        Find related GitHub repositories
      </Typography>

      {/* Tab 1: Related */}
      <Box>

        <Box display="flex" flexDirection="row">
          <Box flexGrow={1}>
            <TextField label="Repository Name" placeholder="e.g. huggingface/transformers"
                       variant="outlined" fullWidth value={repoName}
                       onChange={t => setRepoName(t.target.value)}
                       onKeyPress={ev => ev.key === 'Enter' && startRelativesOperation()}
                       InputProps={{
                         endAdornment: (
                           <IconButton onClick={() => setOpenAdvanced(!openAdvanced)}>
                             {openAdvanced ? <ArrowDropUpIcon/> : <ArrowDropDownIcon/>}
                           </IconButton>
                         ),
                       }}/>
          </Box>

          <IconButton color="primary" size="medium" disabled={!ready} style={{paddingLeft: '24px', paddingRight: '24px'}}
                      onClick={() => startRelativesOperation()}>
            Scan &nbsp; <PlayCircleFilledIcon fontSize="default" style={{color: !ready ? 'lightgray' : 'green'}}/>
          </IconButton>
        </Box>

        {/* Relatives - Advanced Configuration */}
        {openAdvanced && <Paper elevation={6} className={classes.heroParamsPane}>
          <Box>
            <Typography variant={"subtitle2"} color="textSecondary">
              Related Scan - Advanced configuration
            </Typography>
            <Box style={{marginLeft: '1em'}}>
<pre>
  text = {JSON.stringify(repoName, null, 2)}<br/>
  lr = 0.07<br/>
  ...<br/>
  repetitions = {maxStarsPerUser}
</pre>
            </Box>
          </Box>
          <FormControl variant="outlined" style={{minWidth: '100px'}}>
            <InputLabel id="next-gen-repeat-label">Repeat</InputLabel>
            <Select labelId="next-gen-repeat-label" label="Repeat"
                    value={maxStarsPerUser}
                    onChange={e => setMaxStarsPerUser(parseInt(String(e.target.value || '1')))}>
              <MenuItem value={1}>x1</MenuItem>
              <MenuItem value={2}>x2</MenuItem>
              <MenuItem value={5}>x5</MenuItem>
              <MenuItem value={10}>x10</MenuItem>
              <MenuItem value={20}>x20</MenuItem>
              <MenuItem value={50}>x50</MenuItem>
              <MenuItem value={100}>x100</MenuItem>
            </Select>
          </FormControl>
        </Paper>}

      </Box>

      <Box mt={4} mb={4}/>

      <Typography variant="subtitle2" align="center" color="textSecondary" paragraph>
        This is a prototype.
      </Typography>
    </Container>
  </div>;
}