import axios from "axios";
import nodeHttp from "node:http";
import nodeHttps from "node:https";

const httpAgent = new nodeHttp.Agent({
  keepAlive: true,
  maxSockets: 40,
  maxFreeSockets: 10
});

const httpsAgent = new nodeHttps.Agent({
  keepAlive: true,
  maxSockets: 40,
  maxFreeSockets: 10
});

export const http = axios.create({
  timeout: 15000,
  httpAgent,
  httpsAgent,
  headers: {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36",
    Accept: "application/json,text/csv,text/plain,*/*"
  }
});
