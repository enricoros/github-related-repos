import React from "react";
import {AppBar, Box, CircularProgress, Toolbar, Tooltip, Typography} from "@material-ui/core";
import AssessmentIcon from '@material-ui/icons/Assessment';
import WarningRoundedIcon from "@material-ui/icons/WarningRounded";

import {ConnectionStatus, connector} from "../logic/Connector";
import {ServerStatusType} from "../../../common/SharedTypes";


export function TopBar() {
  // UI status
  // const [settingsOpen, setSettingsOpen] = React.useState<boolean>(false);
  // const [settingsAnchor, setSettingsAnchor] = React.useState(null);

  // Connection status
  const [connection, setConnectionStatus] = React.useState<ConnectionStatus>(null);
  React.useEffect(() => {
    const csListener = v => setConnectionStatus({...v});
    connector.connection.addSubscriber(csListener);
    return () => connector.connection.removeSubscriber(csListener);
  }, []);

  // utility functions
  // const openSettings = (element: React.MouseEvent) => {
  //   setSettingsAnchor(element.currentTarget);
  //   setSettingsOpen(true);
  // }

  // Status element (right messaging)
  let statusElement: JSX.Element = null;
  if (connection) {
    // if there's an error, show it
    if (!connection.errorMessage) {
      if (connection.connected) {
        const ss: ServerStatusType = connection.serverStatus || {} as ServerStatusType;
        statusElement = <>
          {ss.isRunning && <CircularProgress color="secondary" size="1.8rem"/>}
          <Typography variant="h6" style={{color: ss.isRunning ? 'aliceblue' : 'white', margin: '12px'}}>
            {ss.isRunning ? 'working' : ''}
          </Typography>
          {/*<Tooltip title={*/}
          {/*  <Typography variant="body2">*/}
          {/*    Connected to <b>the server</b>*/}
          {/*  </Typography>}>*/}
          {/*  <InfoOutlinedIcon fontSize="small"/>*/}
          {/*</Tooltip>*/}
        </>;
      } else
        statusElement = <>
          <Typography variant="h6" noWrap>
            Disconnected&nbsp;
          </Typography>
          <Tooltip title={<Typography variant="body2">Disconnected from the server</Typography>}>
            <WarningRoundedIcon/>
          </Tooltip>
        </>;
    } else
      statusElement = <>
        <Typography variant="h6" noWrap>
          Connection <span style={{color: 'lightpink'}}>{connection.errorMessage}</span>&nbsp;
        </Typography>
        <Tooltip title={<Typography variant="body2">Issue connecting to the server</Typography>}>
          <WarningRoundedIcon/>
        </Tooltip>
      </>;
  }

  // Top bar full layout
  return <AppBar position="relative" elevation={0}>
    <Toolbar>
      <Box mr={2} display="flex" alignItems="center">
        <AssessmentIcon fontSize="default"/>
      </Box>
      <Typography variant="h6" color="inherit" noWrap>
        GitHub KPIs
      </Typography>

      <Box flexGrow={1}/> {/* Expander */}

      <Box display="flex" flexDirection="row" alignItems="center" alignContent="middle">
        <Box display="flex" flexDirection="row" alignItems="center">
          {statusElement}
        </Box>

        {/* Settings Button */}
        {/*<IconButton aria-describedby="settings-popover" style={{marginLeft: '1rem'}} onClick={e => openSettings(e)}>*/}
        {/*  <SettingsIcon fontSize="large"/>*/}
        {/*</IconButton>*/}
      </Box>
    </Toolbar>

    {/* Popover Settings Panel */}
    {/* <Popover id="settings-popover" open={settingsOpen} anchorEl={settingsAnchor}
             onClose={() => setSettingsOpen(false)}
             anchorOrigin={{vertical: 'bottom', horizontal: 'center',}}
             transformOrigin={{vertical: 'top', horizontal: 'right',}}>
      <Container maxWidth="xs">
        <Box m={1}>
          <Typography variant="h6" style={{marginBottom: '1em'}}>Settings</Typography>
          <Box display="flex" flexDirection="row" alignItems="center">
            None yet
          </Box>
          <Box display="flex" flexDirection="row" alignItems="center" justifyContent="flex-end">
            <Button color="primary" disabled={true}>
              Apply
            </Button>
          </Box>
        </Box>
      </Container>
    </Popover> */}
  </AppBar>;
}