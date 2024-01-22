# calendar-sync

## General Diagram
Below is a brief layout of how I synchronize my personal and work calendars

```mermaid
flowchart TB

%% --Colors-- %%
linkStyle default stroke-width:1px stroke:white
classDef blue fill:#27aeef,stroke:#000,stroke-width:1px,color:#000
classDef blueout stroke:#27aeef,stroke-width:1px,color:#fff
classDef gray fill:#AAA,stroke:#000,stroke-width:1px,color:#000
classDef yellow fill:#ede15b,stroke:#000,stroke-width:1px,color:#000
classDef yellowout stroke:#ede15b,stroke-width:1px,color:#fff
classDef green fill:#87bc45,stroke:#000,stroke-width:1px,color:#000
classDef greenout stroke:#87bc45,stroke-width:1px,color:#fff
classDef red fill:#ea5545,stroke:#000,stroke-width:1px,color:#fff

%% CALENDARS %%
subgraph main calendar
MAIN_DEF[MAIN-Default]:::blue
MAIN_Work1Inv[[WORK1-events*]]:::yellowout
MAIN_Work1Block[[WORK1-Blocking]]:::yellowout
MAIN_EVENTS1[[MAIN-Events1]]:::blueout
MAIN_EVENTS2[[MAIN-Events2]]:::blueout
MAIN_EVENTS3[[MAIN-Events3]]:::blueout
MAIN_Work2Inv[[WORK2-events*]]:::greenout
MAIN_Work2Block[[WORK2-Blocking]]:::greenout
%%MAIN_DEF o---o |Google Invites| MAIN_EVENTS1
%%MAIN_DEF o---o |Google Invites| MAIN_EVENTS2
%%MAIN_DEF o---o |Google Invites| MAIN_EVENTS3
MAIN_EVENTS1 o---o |Google Invites| MAIN_DEF
MAIN_EVENTS2 o---o |Google Invites| MAIN_DEF
MAIN_EVENTS3 o---o |Google Invites| MAIN_DEF
end

subgraph work1 calendar
WORK1_DEF[WORK1-Default]:::yellow
WORK1_Star[[WORK1-events*]]:::yellowout
WORK1_DEF --> |"< SyncCommitments() >"| WORK1_Star
WORK1_Block[[WORK1-Blocking]]:::yellowout
WORK1_DEF ~~~ WORK1_Block
end

subgraph sub2 calendar
WORK2_DEF[WORK2-Default]:::green
WORK2_Block[[WORK2-Blocking]]:::greenout
WORK1_DEF ~~~ WORK1_Block
WORK2_Star[[WORK2-events*]]:::greenout
WORK2_DEF --> |"< SyncCommitments() >"| WORK2_Star
end

%% CONNECTIONS %%
MAIN_DEF ---> |Other| WORK1_DEF
WORK1_Star ---> |Shared| MAIN_Work1Inv
WORK1_Block ---> |Shared| MAIN_Work1Block
MAIN_Work1Inv --> |Other| WORK2_DEF
MAIN_Work1Block --> |Other| WORK2_DEF

MAIN_DEF ---> |Other| WORK2_DEF
WORK2_Star ---> |Shared| MAIN_Work2Inv
WORK2_Block ---> |Shared| MAIN_Work2Block
MAIN_Work2Inv --> |Other| WORK1_DEF
MAIN_Work2Block --> |Other| WORK1_DEF

%% --Link Colors-- %%
linkStyle default stroke:white
```

## Main Functions
- `SyncCommitments`: used to synchronize between a `WORK` calendar with its associated `WORK_1_Star` calendar (a copy of the main work calendar, with transformations of the event title, color, description, etc based on the status of that event)
- `SyncForSharing`: used to copy events from **multiple** calendars into a destination calendar that can be used for sharing. Highly customizable based on what things to be shown, etc.