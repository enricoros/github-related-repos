import React from 'react';
import ReactDOM from 'react-dom';
import CssBaseline from '@material-ui/core/CssBaseline';
import {ThemeProvider, createMuiTheme} from '@material-ui/core/styles';
import {App} from './App';

import TimeAgo from 'javascript-time-ago'
import en from 'javascript-time-ago/locale/en'

TimeAgo.addDefaultLocale(en)

const theme = createMuiTheme({
  palette: {
    primary: {
      main: '#3B88C3',
    },/*
    secondary: {
      main: '#C1694F',
    },*/
    background: {
      default: '#fff',
    },
  },
});

ReactDOM.render(
  <React.StrictMode>
    <ThemeProvider theme={theme}>
      <CssBaseline/>
      <App/>
    </ThemeProvider>
  </React.StrictMode>,
  document.querySelector('#root'),
);
