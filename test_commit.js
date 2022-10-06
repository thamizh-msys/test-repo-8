/* eslint-disable no-restricted-syntax */
const path = require('path');
const { Logger, Utility } = require('../helpers/index');
const { cardData } = require('../dataModel/index');
const { issuesModel, commitsModel, pullrequestsModel, cardModel, workflowsModel, projectsModel, boardsModel } = require('../models');
const {
  constants: { JIRA_TICKETS_STATUS }
} = require('../constants');

/**
 * Get calculated time for commits
 *
 * @async
 * @function calculateTimeForCommits
 * @param {Objects} commits
 * @param {Object} jiraObj
 * @returns {Array} commitsTime
 * @author dev-team
 */

const calculateTimeForCommits = async (commits, jiraArr) => {
  try {
    Logger.log('info', 'Calculate time for commits');
    // get transition time and idle time of commits as per issues
    jiraArr.forEach(issue => {
      const filteredCommits = commits.filter(commit => commit.title.includes(issue)).sort((a, b) => new Date(b) - new Date(a));
      let recentCommit;
      let commitDate = '';
      if (filteredCommits.length) {
        recentCommit = [filteredCommits];
        commitDate = filteredCommits.at(-1).date;
      }
      issue.commit_date = commitDate;
      issue.transitions.push({ status: 'commits', time: recentCommit ? Utility.GetTimeDifference(recentCommit.date, issue.date, 'hours') : 0, idle_time: 0 });
    });
    return jiraArr;
  } catch (exc) {
    Logger.log('error', `Error in calculateTimeForCommits in ${path.basename(__filename)}: ${JSON.stringify(exc)}`);
    throw exc;
  }
};

/**
 * Get calculated time for pulls
 *
 * @async
 * @function calculateTimeForPulls
 * @param {Objects} pulls
 * @param {Object} jiraObj
 * @returns {Array} pullsTime
 * @author dev-team
 */

const calculateTimeForPulls = async (pulls, jiraArr) => {
  try {
    Logger.log('info', 'Calculate time for pulls');
    // get transition time and idle time of pulls as per issues and commits
    jiraArr.forEach(issue => {
      const issuePulls = pulls.filter(pull => pull.title.includes(issue.key) && pull.closed_at).sort((a, b) => new Date(a) - new Date(b));
      let totalTime;
      let idleTime;
      if (issuePulls.length) {
        idleTime = issue.commit_date ? Utility.GetTimeDifference([issuePulls].date, issue.commit_date, 'hours') : 0;
        totalTime = issuePulls.reduce((acc, cur) => acc + Utility.GetTimeDifference(cur.closed_at, cur.created_at, 'hours'), 0);
      }
      issue.transitions.push({ status: 'pull request', idle_time: idleTime || 0, time: totalTime || 0 });
    });
    return jiraArr;
  } catch (exc) {
    Logger.log('error', `Error in calculateTimeForPulls in ${path.basename(__filename)}: ${JSON.stringify(exc)}`);
    throw exc;
  }
};

/**
 * Get avg time for transitions
 *
 * @async
 * @function calculateAvgTimeForTransitions
 * @param {Array} workflows
 * @param {Array} jiraArr
 * @returns {Array} avg time
 * @author dev-team
 */

const calculateAvgTimeForTransitions = async (transOrder, jiraArr) => {
  try {
    const devProgress = [];
    // const workflowArr = workflows.reduce((acc, cur) => [...acc, cur.statusId], []);
    // add git metrics after in progress transition
    // const index = workflows.findIndex(wf => wf.untranslatedName === inProgressStages.at(-1));
    // const index = workflowArr.findIndex(wf => wf === '3');
    // workflowArr.splice(index + 1, 0, 'commits', 'pull request');

    // loop all the stages of workflow and create a final array
    for (const trans of transOrder) {
      // calculate transition time and idle time of all the issues
      const { time, idle_time } = jiraArr.reduce(
        (acc, cur) => {
          const filtered = cur.transitions.find(tr => tr.status === trans);
          const timeVal = filtered ? filtered.time : 0;
          const idleTimeVal = filtered ? filtered.idle_time : 0;
          return { ...acc, time: acc.time + timeVal, idle_time: acc.idle_time + idleTimeVal };
        },
        { time: 0, idle_time: 0 }
      );

      // const transObj = workflows.find(wf => wf.statusId === trans);
      // const transName = transObj ? transObj.untranslatedName : trans;
      devProgress.push({
        status: trans,
        time: time ? Math.round(time / jiraArr.length) : 0,
        idle_time: idle_time ? Math.round(idle_time / jiraArr.length) : 0
      });
    }
    // return devProgress.length ? devProgress.sort((a, b) => b.time - a.time) : devProgress;
    return devProgress;
  } catch (exc) {
    Logger.log('error', `Error in calculateAvgTimeForTransitions in ${path.basename(__filename)}: ${JSON.stringify(exc)}`);
    throw exc;
  }
};

/**
 * Handle get time card data
 *
 * @function getAvgIssueTime
 * @param {object} opts
 * @returns {object} - returns avg time data
 * @author dev-team
 */

const getAvgIssueTime = async opts => {
  try {
    Logger.log('info', 'getAvgIssue Time');
    const result = await issuesModel.getIssuesFromDB(opts);
    return result;
  } catch (exc) {
    Logger.log('error', `Error in getAvgIssueTime in ${path.basename(__filename)}: ${JSON.stringify(exc)}`);
    throw exc;
  }
};

/**
 * Handle get time card data
 *
 * @function getAvgTime
 * @param {object} opts
 * @returns {object} - returns avg time data
 * @author dev-team
 */

const getAvgTime = async opts => {
  try {
    Logger.log('info', 'getAvgIssue Time');
    const result = await issuesModel.getDevDataFromDB(opts);
    return result;
  } catch (exc) {
    Logger.log('error', `Error in GetWatchers in ${path.basename(__filename)}: ${JSON.stringify(exc)}`);
    throw exc;
  }
};

/**
 * Handle get transition card data
 *
 * @function getTransitionDetails
 * @param {object} opts
 * @returns {object} - returns Transitions data
 * @author lalit-msys
 */

const getTransitionDetails = async opts => {
  try {
    Logger.log('info', 'Get getTransitionDetails');
    const data = await issuesModel.getIssuesProgressData(opts);
    const groupByStatus = await Utility.CountAndSet(data.result, data.statuses);
    const finalData = [];
    // time calculation for each status
    const keys = Object.keys(groupByStatus);
    keys.forEach(async status => {
      const dataInput = data.result.filter(item => item.status === status);
      const time = await Utility.statusWiseDataSpit(dataInput, status);
      let progressValue = data.result.length > 0 ? (dataInput.length / data.result.length) * 100 : 0;
      progressValue = +progressValue.toFixed(2);
      finalData.push({
        status,
        time,
        count: dataInput.length,
        progress: `${progressValue}%`
      });
    });
    return finalData;
  } catch (exc) {
    Logger.log('error', `Error in getTransitionDetails in ${path.basename(__filename)}: ${JSON.stringify(exc)}`);
    throw exc;
  }
};

/**
 * Handle get Project card data
 *
 * @function getProject
 * @param {object} opts
 * @returns {object} - returns watchers data
 * @author dev-team
 */

const getProject = async () => {
  try {
    Logger.log('info', 'Get Project Info');
    const result = await cardData.ProjectInfo;
    return result;
  } catch (exc) {
    Logger.log('error', `Error in ProjectInfo in ${path.basename(__filename)}: ${JSON.stringify(exc)}`);
    throw exc;
  }
};

const getAverageClosedTime = async opts => {
  try {
    Logger.log('info', 'getAverageClosedTime based on date selection or sprint selection');
    let result;
    const { since, until } = opts;
    const workflowData = await issuesModel.getWorkflowStatus(opts);
    const issuesList = await issuesModel.GetIsssuesOnRangeFromDB(opts, workflowData.statuses);
    const issuesFiltered = issuesList.filter(issue => issue.closed_at >= since && issue.closed_at <= until);
    if (issuesFiltered.length) {
      result = await Utility.ClosedIssueSplitUpByDuration(issuesFiltered, opts, 'Issue', workflowData.indeterminate);
    }
    return {
      type: result ? result.category : '',
      graphs: result ? result.graphs : []
    };
  } catch (exc) {
    Logger.log('error', `Error in getAverageClosedTime in ${path.basename(__filename)}: ${JSON.stringify(exc)}`);
    throw exc;
  }
};
/**
 * Handle get Throughput card data
 *
 * @function getThroughput
 * @param {object} opts
 * @returns {object} - returns throughput data
 * @author dev-team
 */

const getThroughput = async opts => {
  try {
    Logger.log('info', 'getThroughput based on date selection or sprint selection');
    let result;
    const { since, until } = opts;
    const issuesList = await issuesModel.GetThroughPutFromDB(opts);
    const issuesFiltered = issuesList.filter(issue => issue.closed_at >= since && issue.closed_at <= until);
    if (issuesFiltered.length) {
      result = await Utility.GraphDataSplitUpByDuration(issuesList, opts, 'Throughput');
    }
    return {
      throughput: Number((issuesFiltered.length / Utility.GetTimeDifference(until, since)).toFixed(1)) || 0,
      type: result ? result.category : '',
      graphs: result ? result.response : []
    };
  } catch (exc) {
    Logger.log('error', `Error in getThroughput in ${path.basename(__filename)}: ${JSON.stringify(exc)}`);
    throw exc;
  }
};

/**
 * Handles Issue Types Count card data
 *
 * @function getIssueTypesCount
 * @param {object} opts
 * @returns {object} - returns issue counts data
 * @author dev-team
 */

const getIssueTypesCount = async opts => {
  try {
    Logger.log('info', 'Get Issue Types Count');
    const result = await cardModel.getIssueTypesCount(opts);
    return result;
  } catch (exc) {
    Logger.log('error', `Error in getIssueTypesCount in ${path.basename(__filename)}: ${JSON.stringify(exc)}`);
    throw exc;
  }
};

/**
 * Handle the Issue HeatMap card data
 *
 * @function getIssueHeatMap
 * @param {object} opts
 * @returns {object} - returns issue heatmap data
 * @author dev-team
 */
const getIssueHeatMap = async opts => {
  try {
    Logger.log('info', 'Get Issues for heat map');
    const list = await cardModel.GetHeatMapFromDB(opts);
    return list;
  } catch (exc) {
    Logger.log('error', `Error in getIssueHeatMap in ${path.basename(__filename)}: ${JSON.stringify(exc)}`);
    throw exc;
  }
};

/**
 Handle Development Progress data
*
* @function getDevelopmentProgress
* @param { object } opts
* @returns { object } - returns issue counts data
* @author dev - team
*
*/

const getDevelopmentProgress = async opts => {
  try {
    Logger.log('info', 'Get Development Progress Count');

    // get project info
    const project = await projectsModel.GetProjectRepoListFromDB(opts);
    if (!project) return [];

    // get board info
    const board = await boardsModel.GetBoardDetails(opts);
    if (!board) return [];
    const transOrder =
      board.transitionOrder ||
      Object.keys(board.boardConfig)
        .reduce((acc, cur) => [...acc, board.boardConfig[cur]], [])
        .flat();

    // collect workflow info for a project
    const workflowRes = await workflowsModel.GetWorkflowsFromDB(opts);
    if (!workflowRes.length) return [];
    let inProgressStages = workflowRes.filter(wf => wf.key === 'indeterminate');
    const allStages = [];
    Object.values(JIRA_TICKETS_STATUS).forEach(wf => {
      const filtered = workflowRes.find(workflow => workflow.key === wf);
      if (filtered) {
        allStages.push(filtered.workflows);
        if (wf === 'indeterminate') inProgressStages.push(filtered.workflows);
      }
    });
    inProgressStages = inProgressStages.flat().reduce((acc, cur) => [...acc, cur.untranslatedName], []);

    // get jira issues based on the filter
    let jiraArr = await issuesModel.getDevDataFromDB(opts, inProgressStages);
    if (!jiraArr.length) return [];

    // regex of issues to get associated commits and pulls
    let regPattern = '';
    jiraArr.forEach((el, index) => {
      regPattern = `${regPattern}${el.key}${jiraArr.length - 1 === index ? '' : '|'}`;
    });
    const regexObj = new RegExp(regPattern);

    if (transOrder.includes('commits')) {
      const [commits, pulls] = await Promise.all([
        commitsModel.getCommitsForDateRange({ ...opts, regexObj, gitOrgName: project.git_org_name }),
        pullrequestsModel.getPRForDateRange({ ...opts, regexObj, gitOrgName: project.git_org_name })
      ]);

      // calculate avg time of commits and pulls of all the issues.
      jiraArr = await calculateTimeForCommits(commits, jiraArr);
      jiraArr = await calculateTimeForPulls(pulls, jiraArr);
    }

    const devProgress = await calculateAvgTimeForTransitions(transOrder, jiraArr, inProgressStages);
    return devProgress;
  } catch (exc) {
    Logger.log('error', `Error in getDevelopmentProgress in ${path.basename(__filename)}: ${JSON.stringify(exc)}`);
    throw exc;
  }
};

/**
 * Handle Sprint Activity card data
 *
 * @function getSprintActivity
 * @param {object} opts
 * @returns {object} - returns sprint activity data
 * @author dev-team
 */

const getSprintActivity = async opts => {
  try {
    Logger.log('info', 'Get Sprint Activity');
    const result = await cardModel.getSprintActivity(opts);
    return result;
  } catch (exc) {
    Logger.log('error', `Error in getSprintActivity in ${path.basename(__filename)}: ${JSON.stringify(exc)}`);
    throw exc;
  }
};

module.exports = {
  getAvgIssueTime,
  getTransitionDetails,
  getProject,
  getThroughput,
  getIssueTypesCount,
  getAvgTime,
  getIssueHeatMap,
  getDevelopmentProgress,
  getSprintActivity,
  getAverageClosedTime
};
