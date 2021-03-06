/*
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { JobStatus, } from './jobs/job-status'

angular.module('zeppelinWebApp')
  .controller('JobManagerCtrl', JobManagerCtrl)

const JobDateSorter = {
  RECENTLY_UPDATED: 'Recently Update',
  OLDEST_UPDATED: 'Oldest Updated',
}

function JobManagerCtrl ($scope, websocketMsgSrv, $interval, ngToast, $q, $timeout, jobManagerFilter) {
  'ngInject'

  $scope.pagination = {
    currentPage: 1,
    itemsPerPage: 10,
    maxPageCount: 5,
  }

  $scope.sorter = {
    AvailableDateSorter: Object.keys(JobDateSorter).map(key => { return JobDateSorter[key] }),
    currentDateSorter: JobDateSorter.RECENTLY_UPDATED,
  }

  $scope.setJobDateSorter = function(dateSorter) {
    $scope.sorter.currentDateSorter = dateSorter
  }

  $scope.getJobsInCurrentPage = function(jobs) {
    const cp = $scope.pagination.currentPage
    const itp = $scope.pagination.itemsPerPage
    return jobs.slice((cp - 1) * itp, (cp * itp))
  }

  ngToast.dismiss()
  let asyncNotebookJobFilter = function (jobInfomations, filterConfig) {
    return $q(function (resolve, reject) {
      $scope.JobInfomationsByFilter = $scope.jobTypeFilter(jobInfomations, filterConfig)
      resolve($scope.JobInfomationsByFilter)
    })
  }

  $scope.$watch('sorter.currentDateSorter', function() {
    $scope.filterConfig.isSortByAsc =
      $scope.sorter.currentDateSorter === JobDateSorter.OLDEST_UPDATED
    asyncNotebookJobFilter($scope.jobInfomations, $scope.filterConfig)
  })

  $scope.getJobIconByStatus = function(jobStatus) {
    if (jobStatus === JobStatus.READY) {
      return 'fa fa-circle-o'
    } else if (jobStatus === JobStatus.FINISHED) {
      return 'fa fa-circle'
    } else if (jobStatus === JobStatus.ABORT) {
      return 'fa fa-circle'
    } else if (jobStatus === JobStatus.ERROR) {
      return 'fa fa-circle'
    } else if (jobStatus === JobStatus.PENDING) {
      return 'fa fa-circle'
    } else if (jobStatus === JobStatus.RUNNING) {
      return 'fa fa-spinner'
    }
  }

  $scope.getJobColorByStatus = function(jobStatus) {
    if (jobStatus === JobStatus.READY) {
      return 'green'
    } else if (jobStatus === JobStatus.FINISHED) {
      return 'green'
    } else if (jobStatus === JobStatus.ABORT) {
      return 'orange'
    } else if (jobStatus === JobStatus.ERROR) {
      return 'red'
    } else if (jobStatus === JobStatus.PENDING) {
      return 'gray'
    } else if (jobStatus === JobStatus.RUNNING) {
      return 'blue'
    }
  }

  $scope.doFiltering = function (jobInfomations, filterConfig) {
    asyncNotebookJobFilter(jobInfomations, filterConfig)
      .then(
        () => { $scope.isLoadingFilter = false },
        (error) => {
          console.error('Failed to search jobs from server', error)
        }
      )
  }

  $scope.filterValueToName = function (filterValue, maxStringLength) {
    if ($scope.activeInterpreters === undefined) {
      return
    }
    let index = _.findIndex($scope.activeInterpreters, {value: filterValue})
    if ($scope.activeInterpreters[index].name !== undefined) {
      if (maxStringLength !== undefined && maxStringLength > $scope.activeInterpreters[index].name) {
        return $scope.activeInterpreters[index].name.substr(0, maxStringLength - 3) + '...'
      }
      return $scope.activeInterpreters[index].name
    } else {
      return 'NONE'
    }
  }

  $scope.setFilterValue = function (filterValue) {
    $scope.filterConfig.filterValueInterpreter = filterValue
    $scope.doFiltering($scope.jobInfomations, $scope.filterConfig)
  }

  $scope.init = function () {
    $scope.isLoadingFilter = true
    $scope.jobInfomations = []
    $scope.JobInfomationsByFilter = $scope.jobInfomations
    $scope.filterConfig = {
      isRunningAlwaysTop: true,
      filterValueNotebookName: '',
      filterValueInterpreter: '*',
      isSortByAsc: $scope.sorter.currentDateSorter === JobDateSorter.OLDEST_UPDATED,
    }
    $scope.sortTooltipMsg = 'Switch to sort by desc'
    $scope.jobTypeFilter = jobManagerFilter

    websocketMsgSrv.getNoteJobsList()

    $scope.$on('$destroy', function () {
      websocketMsgSrv.unsubscribeJobManager()
    })
  }

  /*
   ** $scope.$on functions below
   */

  $scope.$on('setNoteJobs', function (event, responseData) {
    $scope.lastJobServerUnixTime = responseData.lastResponseUnixTime
    $scope.jobInfomations = responseData.jobs
    $scope.jobInfomationsIndexs = $scope.jobInfomations ? _.indexBy($scope.jobInfomations, 'noteId') : {}
    $scope.jobTypeFilter($scope.jobInfomations, $scope.filterConfig)
    $scope.activeInterpreters = [
      {
        name: 'ALL',
        value: '*'
      }
    ]
    let interpreterLists = _.uniq(_.pluck($scope.jobInfomations, 'interpreter'), false)
    for (let index = 0, length = interpreterLists.length; index < length; index++) {
      $scope.activeInterpreters.push({
        name: interpreterLists[index],
        value: interpreterLists[index]
      })
    }
    $scope.doFiltering($scope.jobInfomations, $scope.filterConfig)
  })

  $scope.$on('setUpdateNoteJobs', function (event, responseData) {
    let jobInfomations = $scope.jobInfomations
    let indexStore = $scope.jobInfomationsIndexs
    $scope.lastJobServerUnixTime = responseData.lastResponseUnixTime
    let notes = responseData.jobs
    notes.map(function (changedItem) {
      if (indexStore[changedItem.noteId] === undefined) {
        let newItem = angular.copy(changedItem)
        jobInfomations.push(newItem)
        indexStore[changedItem.noteId] = newItem
      } else {
        let changeOriginTarget = indexStore[changedItem.noteId]

        if (changedItem.isRemoved !== undefined && changedItem.isRemoved === true) {
          // remove Item.
          let removeIndex = _.findIndex(indexStore, changedItem.noteId)
          if (removeIndex > -1) {
            indexStore.splice(removeIndex, 1)
          }

          removeIndex = _.findIndex(jobInfomations, {'noteId': changedItem.noteId})
          if (removeIndex) {
            jobInfomations.splice(removeIndex, 1)
          }
        } else {
          // change value for item.
          changeOriginTarget.isRunningJob = changedItem.isRunningJob
          changeOriginTarget.noteName = changedItem.noteName
          changeOriginTarget.noteType = changedItem.noteType
          changeOriginTarget.interpreter = changedItem.interpreter
          changeOriginTarget.unixTimeLastRun = changedItem.unixTimeLastRun
          changeOriginTarget.paragraphs = changedItem.paragraphs
        }
      }
    })
    $scope.doFiltering(jobInfomations, $scope.filterConfig)
  })
}
