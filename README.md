<!--
Copyright 2026 Google LLC

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

      http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
-->

## Overview

The DV360 Live Pacing Tracker is a Google Sheets based tool which leverages Apps Script and the DV360 API to monitor campaigns pacing in real-time.

## Solution Requirements

- Users who run the script should have access to the DV360 accounts they want to report on.

## Solution Setup

1. Make a copy of the template - [click on this link](https://docs.google.com/spreadsheets/d/1Bi4oIC2HWuy4XHewp3CCxi_Tw8cKOyWtKgqxqUhY6mM/copy)

2. Configure sheet: enter desired advertiser IDs, names and optional custom labels in the "Account Mapping" sheet.

3. Run the script: go to 🤖 Automation > Refresh Dashboard

## FAQ

### How to set up an automatic refresh?

You can program an automatic refresh of the dashboard from the script configuration:

1. Go to Extensions > Apps Script

2. Select Triggers

3. Click on the blue “Add Trigger” button

4. Use the following settings:

   - Choose which function to run: **refreshRawData**
   - Choose which deployment should run: **Head**
   - Select event source: **Time-driven**
   - Select type of time based trigger: **Hour timer**
   - Select hour interval: **(choose your preference)**
   - Failure notification settings: **Notify me immediately**

5. Save
