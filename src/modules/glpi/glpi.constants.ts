/**
 * @file glpi.constants.ts
 * @description Constantes de cabeceras HTTP, endpoints REST, estados y campos de búsqueda de GLPI.
 */
export const GLPI_HEADERS = {
  APP_TOKEN: "App-Token",
  SESSION_TOKEN: "Session-Token",
  AUTHORIZATION: "Authorization",
  CONTENT_TYPE: "Content-Type",
  CONTENT_RANGE: "Content-Range",
  RANGE: "Range",
} as const;

export const GLPI_ENDPOINTS = {
  INIT_SESSION: "initSession",
  KILL_SESSION: "killSession",
  GET_MY_PROFILES: "getMyProfiles",
  GET_FULL_SESSION: "getFullSession",
  USER: "User",
  USER_EMAIL: "UserEmail",
  USER_TITLE: "UserTitle",
  GROUP: "Group",
  GROUP_USER: "Group_User",
  PROFILE: "Profile",
  PROFILE_USER: "Profile_User",
  LOCATION: "Location",
  ENTITY: "Entity",
  ITIL_CATEGORY: "ITILCategory",
  TICKET: "Ticket",
  TICKET_USER: "Ticket_User",
  DOCUMENT: "Document",
  DOCUMENT_ITEM: "Document_Item",
  SEARCH: "search",
} as const;

export const GLPI_TICKET_TYPE = {
  INCIDENT: 1,
  REQUEST: 2,
} as const;

export const GLPI_TICKET_STATUS = {
  NEW: 1,
  ASSIGNED: 2,
  PLANNED: 3,
  WAITING: 4,
  SOLVED: 5,
  CLOSED: 6,
} as const;

export const GLPI_TICKET_URGENCY = {
  VERY_LOW: 1,
  LOW: 2,
  MEDIUM: 3,
  HIGH: 4,
  VERY_HIGH: 5,
} as const;

export const GLPI_TICKET_USER_TYPE = {
  REQUESTER: 1,
  ASSIGNED: 2,
  OBSERVER: 3,
} as const;

export const GLPI_TICKET_SEARCH_FIELDS = {
  ID: 2,
  TITLE: 1,
  STATUS: 12,
  REQUESTER: 4,
  TECHNICIAN: 5,
  TYPE: 14,
  CATEGORY: 7,
  LOCATION: 83,
  URGENCY: 3,
  PRIORITY: 30,
  DESCRIPTION: 21,
  DATE_CREATION: 15,
  DATE_DUE: 18,
  DATE_MOD: 19,
} as const;
