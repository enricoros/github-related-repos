import React from "react";
import {Box, Link, Typography} from "@material-ui/core";

export const Footer = () => <footer>
  <Box mt={8} mb={4}>
    <Typography variant="body1" align="center" color="textSecondary">
      <Link href="https://github.com/soulreplica/soulreplica-brodown">Github</Link>. Made with ❤️, of course.
    </Typography>
    <Typography variant="body2" color="textSecondary" align="center">
      Copyright © {new Date().getFullYear()}.
    </Typography>
  </Box>
</footer>;