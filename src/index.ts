/**
 * Copyright 2025 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *       http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
import {removeDuplicates} from './utils';

/* eslint-disable-next-line @typescript-eslint/no-unused-vars */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('🤖 Automation')
    .addItem('Refresh Dashboard', 'refreshRawData')
    .addToUi();
}

/**
 * Creates a DV360 query to retrieve pacing data for insertion orders under a
 * given set of advertiser IDs, within a given date range.
 *
 * @param advertiserIds An array of advertiser IDs.
 * @param startDate The start date for the query (inclusive).
 * @param endDate The end date for the query (inclusive).
 * @return The ID of the created query.
 */
function createDV360Query(
  advertiserIds: Array<string | number>,
  startDate: Date,
  endDate: Date,
): string {
  const token = ScriptApp.getOAuthToken();
  const tz = SpreadsheetApp.getActive().getSpreadsheetTimeZone();
  const url = 'https://doubleclickbidmanager.googleapis.com/v2/queries';

  const body = {
    metadata: {
      title: 'Live Pacing Tracker - Temp',
      dataRange: {
        range: 'CUSTOM_DATES',
        customStartDate: {
          year: Utilities.formatDate(startDate, tz, 'yyyy'),
          month: Utilities.formatDate(startDate, tz, 'MM'),
          day: Utilities.formatDate(startDate, tz, 'dd'),
        },
        customEndDate: {
          year: Utilities.formatDate(endDate, tz, 'yyyy'),
          month: Utilities.formatDate(endDate, tz, 'MM'),
          day: Utilities.formatDate(endDate, tz, 'dd'),
        },
      },
      format: 'CSV',
    },
    params: {
      type: 'STANDARD',
      groupBys: [
        'FILTER_PARTNER',
        'FILTER_ADVERTISER_NAME',
        'FILTER_ADVERTISER',
        'FILTER_ADVERTISER_CURRENCY',
        'FILTER_INSERTION_ORDER_NAME',
        'FILTER_INSERTION_ORDER',
        'FILTER_INSERTION_ORDER_STATUS',
        'FILTER_BUDGET_SEGMENT_DESCRIPTION',
        'FILTER_BUDGET_SEGMENT_BUDGET',
        'FILTER_BUDGET_SEGMENT_START_DATE',
        'FILTER_BUDGET_SEGMENT_END_DATE',
        'FILTER_BUDGET_SEGMENT_TYPE',
        'FILTER_DATE',
        'FILTER_LINE_ITEM_TYPE',
        'FILTER_INVENTORY_COMMITMENT_TYPE',
      ],
      filters: advertiserIds.map(advertiserId => ({
        type: 'FILTER_ADVERTISER',
        value: advertiserId.toString(),
      })),
      metrics: ['METRIC_IMPRESSIONS', 'METRIC_REVENUE_ADVERTISER'],
      options: {},
    },
    schedule: {
      frequency: 'ONE_TIME',
    },
  };

  const options = {
    method: 'POST' as GoogleAppsScript.URL_Fetch.HttpMethod,
    headers: {Authorization: `Bearer ${token}`, Accept: 'application/json'},
    contentType: 'application/json',
    muteHttpExceptions: false,
    payload: JSON.stringify(body),
  };

  const response = UrlFetchApp.fetch(url, options);
  const data = JSON.parse(response.getContentText());
  const queryId = data.queryId;
  console.log(`Created query ${queryId}`);

  return queryId;
}

/**
 * Runs a DV360 query synchronously and returns the results.
 *
 * @param queryId The ID of the DV360 query to run.
 * @return An object containing the run finish time of the query and the URL
 *  of the CSV file with the results.
 */
function runDV360Query(queryId: string): {
  finishTime: string;
  csvUrl: string;
} {
  const token = ScriptApp.getOAuthToken();
  const url = `https://doubleclickbidmanager.googleapis.com/v2/queries/${queryId}:run?synchronous=true`;

  const options = {
    method: 'POST' as GoogleAppsScript.URL_Fetch.HttpMethod,
    headers: {Authorization: `Bearer ${token}`, Accept: 'application/json'},
    contentType: 'application/json',
    muteHttpExceptions: false,
  };

  console.log(`Running query ${queryId}`);
  const response = UrlFetchApp.fetch(url, options);
  const data = JSON.parse(response.getContentText());

  const finishTime = data.metadata.status.finishTime;
  const csvUrl = data.metadata.googleCloudStoragePath;

  return {finishTime, csvUrl};
}

/**
 * Retrieves the results from a DV360 report CSV URL and returns them as a
 * 2D array (after removing the summary rows).
 *
 * @param csvUrl The URL of the CSV file.
 * @return A 2D array containing the data from the CSV file.
 */
function getResultsFromCsv(csvUrl: string): string[][] {
  const responseContent = UrlFetchApp.fetch(csvUrl).getContentText();
  const results = Utilities.parseCsv(responseContent);

  const headers = results[0];
  const partnerIdIdx = headers.indexOf('Partner ID');

  let lastRowPartnerId = results[results.length - 1][partnerIdIdx];
  // pop rows whose partner ID is not a positive number (summary rows)
  while (results.length > 1 && !(Number(lastRowPartnerId) > 0)) {
    results.pop();
    lastRowPartnerId = results[results.length - 1][partnerIdIdx];
  }

  return results;
}

/**
 * Deletes a DV360 query.
 *
 * @param queryId The ID of the DV360 query to delete.
 */
function deleteDV360Query(queryId: string) {
  const token = ScriptApp.getOAuthToken();
  const url = `https://doubleclickbidmanager.googleapis.com/v2/queries/${queryId}`;

  const options = {
    method: 'DELETE' as GoogleAppsScript.URL_Fetch.HttpMethod,
    headers: {Authorization: `Bearer ${token}`, Accept: 'application/json'},
    contentType: 'application/json',
    muteHttpExceptions: false,
  };

  try {
    UrlFetchApp.fetch(url, options);
  } catch (error) {
    console.log(`Error trying to delete query ${queryId}: ${error}`);
    return;
  }

  console.log(`Deleted query ${queryId}`);
}

/**
 * Writes the provided 2D array of data to the specified Google Sheet. It
 * clears pre-existing values in the sheet.
 * Logs an error if the input data is malformed (empty or uneven row lengths).
 *
 * @param tabularData A 2D array representing the data to be written, where
 *  each inner array is a row.
 * @param sheetName The name of the sheet to write to.
 */
function writeResultsToSheet(tabularData: string[][], sheetName: string) {
  if (
    tabularData.length === 0 ||
    tabularData.some(row => row.length !== tabularData[0].length)
  ) {
    console.error('Tabular data empty or with mixed rows lengths.');
    return;
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();

  Sheets.Spreadsheets!.Values!.clear(null, ss.getId(), sheetName);
  Sheets.Spreadsheets!.Values!.update(
    {values: tabularData},
    ss.getId(),
    sheetName,
    {valueInputOption: 'USER_ENTERED'},
  );
}

/**
 * Retrieves a list of unique advertiser IDs from a specified Google Sheet
 * (defaults to 'Account Mapping').
 * Reads from column A starting at row 2 and ignores blank cells. Logs an error
 * if the specified sheet does not exist.
 *
 * @param sheetName Optional. Name of sheet containing the IDs.
 *  Defaults to "Account Mapping".
 * @return An array of unique advertiser ID strings, or undefined if the sheet
 *  is not found.
 */
function getAdvertiserIds(sheetName = 'Account Mapping'): string[] | undefined {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const inputSheet = ss.getSheetByName(sheetName);
  if (!inputSheet) {
    console.error(`Couldn't find account mapping in sheet ${sheetName}`);
    return;
  }
  const columnValues = inputSheet
    .getRange('A2:A')
    .getValues()
    .map(row => row[0])
    .filter(val => !!val); // remove blanks
  const accountIds = removeDuplicates(columnValues);

  return accountIds;
}

/**
 * Refreshes the raw data in the spreadsheet by querying DV360 for the last
 * 70 days of data for a set of advertisers.
 * The advertiser IDs are retrieved from the "Account Mapping" sheet. The
 * results are written to the "Raw Data" sheet.
 * The last extraction time is updated in the "Extract Info" sheet. Any
 * created DV360 query is deleted after use.
 */
/* eslint-disable-next-line @typescript-eslint/no-unused-vars */
function refreshRawData() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const resultsSheetName = 'Raw Data';

  // Date range: last 70 days
  const endDate = new Date(); // today
  const startDate = new Date(endDate);
  startDate.setDate(startDate.getDate() - 70);

  const advertiserIds = getAdvertiserIds();
  if (!advertiserIds) {
    console.error('Advertiser IDs not found - aborting!');
    return;
  }

  console.log(
    `Updating data for ${advertiserIds.length} advertisers between ${Utilities.formatDate(startDate, 'utc', 'yyyy-MM-dd')} and ${Utilities.formatDate(endDate, 'utc', 'yyyy-MM-dd')}`,
  );

  if (advertiserIds.length === 0) {
    console.log('No advertiser IDs to report on!');
    return;
  }
  const queryId = createDV360Query(advertiserIds, startDate, endDate);

  try {
    const {finishTime, csvUrl} = runDV360Query(queryId);
    console.log(`Retrieving data from url: ${csvUrl}`);

    const results = getResultsFromCsv(csvUrl);

    console.log(
      `Writing results in sheet '${resultsSheetName}' (${results.length} rows)`,
    );
    writeResultsToSheet(results, resultsSheetName);

    ss
      .getRangeByName("'Extract Info'!last_extraction")
      ?.setValue(
        new Date(finishTime).toLocaleString('en-US', {timeZone: 'utc'}),
      );
  } catch (error) {
    console.log(`Could not get results for query ${queryId} - error: ${error}`);
  }

  deleteDV360Query(queryId);
}
